import * as Crypto from 'expo-crypto';
import { File, UploadType } from 'expo-file-system';

import { logger } from '@/services/logger';

import { isSupabaseConfigured, projectUrl, publishableKey, supabase } from './client';
import { AppError, toAppError } from './errors';

/**
 * Recorded media, in the private bucket.
 *
 * Two rules shape everything here. Nothing is ever public: the bucket has no
 * unauthenticated URL at all, and every read goes through a signed URL minted
 * for that moment and thrown away. And the row is written *before* the bytes
 * are sent, so an upload that dies halfway leaves something to find rather
 * than an orphaned file nobody knows about.
 */

const BUCKET = 'entry-media';

export interface MediaContext {
  diaryId: string;
  userId: string;
}

export type MediaResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

/**
 * Where a file lives in the bucket.
 *
 * The first segment is the diary, because that is what the storage policies
 * check — the same membership rule the tables use, through the same helper. A
 * path is therefore not a secret, but it is also not a way in.
 */
export function storagePath(
  diaryId: string,
  entryId: string,
  extension: string,
  uuid: string,
): string {
  const safe = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `${diaryId}/${entryId}/${uuid}.${safe}`;
}

const MIME: Record<string, string> = {
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export function mimeFor(extension: string): string {
  return MIME[extension.toLowerCase()] ?? 'application/octet-stream';
}

function extensionOf(uri: string): string {
  const withoutQuery = uri.split('?')[0] ?? uri;
  const found = withoutQuery.split('.').pop();
  return found === undefined || found === withoutQuery ? 'mov' : found;
}

// ---------------------------------------------------------------------------
// Uploading
// ---------------------------------------------------------------------------

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Sends one file, streamed off disk.
 *
 * Deliberately not `supabase.storage.upload`, which wants the bytes in memory
 * first. A two-minute clip is well over a hundred megabytes, and materialising
 * that as a JavaScript value on a phone is how an app gets killed mid-save.
 * The native uploader reads the file as it goes.
 */
async function putFile(localUri: string, path: string, contentType: string): Promise<void> {
  const token = await accessToken();
  if (token === null) throw new AppError('unauthorized', 'Please sign in again to continue.');

  const file = new File(localUri);
  if (!file.exists) throw new AppError('not_found', 'That recording is no longer on this device.');

  const result = await file.upload(`${projectUrl}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
    uploadType: UploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: publishableKey,
      'Content-Type': contentType,
      // Retrying an upload that half-finished must overwrite rather than
      // collide, or a flaky connection permanently blocks its own retry.
      'x-upsert': 'true',
    },
  });

  if (result.status < 200 || result.status >= 300) {
    logger.error('Media upload rejected', { status: result.status });
    throw new AppError('unknown', 'That recording could not be saved to your account.');
  }
}

export interface UploadedMedia {
  storagePath: string;
  posterPath: string | null;
}

/**
 * Puts an entry's recording in the bucket and records it.
 *
 * Order matters, and it is the opposite of the obvious one. The `entry_media`
 * row is written first, as `pending`, so that an upload interrupted by a dead
 * battery leaves a row `stale_pending_media` can find. Uploading first and
 * recording afterwards would leave the bytes with nothing pointing at them:
 * invisible to the user, invisible to the reconciler, and billed for forever.
 */
export async function uploadRecording(
  entryId: string,
  videoUri: string,
  posterUri: string | undefined,
  context: MediaContext,
): Promise<MediaResult<UploadedMedia>> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: new AppError('unknown', 'No account service in this build.') };
  }

  try {
    // Reuse the row from an earlier attempt rather than making a second one,
    // so a retry does not leave a trail of pending rows and orphaned objects.
    const { data: existing } = await supabase
      .from('entry_media')
      .select('id, storage_path, poster_path, status')
      .eq('entry_id', entryId)
      .limit(1);

    const previous = existing?.[0];
    const extension = extensionOf(videoUri);
    const path =
      previous?.storage_path ??
      storagePath(context.diaryId, entryId, extension, Crypto.randomUUID());
    const posterTarget =
      posterUri === undefined
        ? null
        : (previous?.poster_path ??
          storagePath(context.diaryId, entryId, 'jpg', Crypto.randomUUID()));

    if (previous === undefined) {
      const { error } = await supabase.from('entry_media').insert({
        entry_id: entryId,
        diary_id: context.diaryId,
        kind: 'video',
        storage_path: path,
        poster_path: posterTarget,
        mime_type: mimeFor(extension),
        status: 'pending',
      });

      if (error !== null) return { ok: false, error: toAppError(error, 'record media') };
    }

    // The poster first: it is small, it fails fast, and a timeline with a
    // still but no clip yet is a better half-state than the reverse.
    if (posterUri !== undefined && posterTarget !== null) {
      await putFile(posterUri, posterTarget, 'image/jpeg');
    }

    await putFile(videoUri, path, mimeFor(extension));

    const size = sizeOf(videoUri);
    const { error: updateError } = await supabase
      .from('entry_media')
      .update({
        status: 'uploaded',
        ...(size !== null ? { size_bytes: size } : {}),
      })
      .eq('entry_id', entryId)
      .eq('storage_path', path);

    if (updateError !== null) return { ok: false, error: toAppError(updateError, 'record media') };

    return { ok: true, value: { storagePath: path, posterPath: posterTarget } };
  } catch (error) {
    // The row stays `pending`, which is the point of writing it first.
    return { ok: false, error: toAppError(error, 'upload media') };
  }
}

function sizeOf(uri: string): number | null {
  try {
    return new File(uri).size ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reading it back
// ---------------------------------------------------------------------------

/** How long a minted URL is good for. Long enough to watch, short enough to matter. */
const SIGNED_URL_TTL_SECONDS = 3600;

/** Re-mint slightly early rather than hand out one that expires mid-playback. */
const REFRESH_MARGIN_MS = 60_000;

/**
 * Signed URLs, held in memory only.
 *
 * Never written to disk. A persisted signed URL is a bearer token for a video
 * of someone's worst week, sitting in AsyncStorage for whoever reads the
 * device next — and it would still work after they signed out.
 */
const signedUrls = new Map<string, { url: string; expiresAt: number }>();

export async function signedUrlFor(path: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  const cached = signedUrls.get(path);
  if (cached !== undefined && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached.url;
  }

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error !== null || data === null) {
      toAppError(error, 'sign media url');
      return null;
    }

    signedUrls.set(path, {
      url: data.signedUrl,
      expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
    });

    return data.signedUrl;
  } catch (error) {
    toAppError(error, 'sign media url');
    return null;
  }
}

/**
 * Drops every minted URL.
 *
 * Called on sign-out. They stay valid until they expire, so leaving them in a
 * live process after the session ends is a small open door for no benefit.
 */
export function forgetSignedUrls(): void {
  signedUrls.clear();
}

export interface RemoteMedia {
  entryId: string;
  storagePath: string;
  posterPath: string | null;
  status: string;
}

/** Where the media for a set of entries lives, so a second device can fetch it. */
export async function mediaForEntries(entryIds: string[]): Promise<RemoteMedia[]> {
  if (!isSupabaseConfigured || entryIds.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from('entry_media')
      .select('entry_id, storage_path, poster_path, status')
      .in('entry_id', entryIds);

    if (error !== null) {
      toAppError(error, 'find media');
      return [];
    }

    return (data ?? []).map((row) => ({
      entryId: row.entry_id as string,
      storagePath: row.storage_path as string,
      posterPath: (row.poster_path as string | null) ?? null,
      status: row.status as string,
    }));
  } catch (error) {
    toAppError(error, 'find media');
    return [];
  }
}

// ---------------------------------------------------------------------------
// Uploads that never finished
// ---------------------------------------------------------------------------

export interface StaleMedia {
  id: string;
  entryId: string;
  storagePath: string;
}

/**
 * Rows whose upload never completed.
 *
 * The database function behind this runs as invoker, so RLS applies and a
 * caller only ever sees their own. What to do about each one is a question
 * only the device can answer — whether it still has the file — so the decision
 * is made in `reconcilePendingMedia` rather than by a scheduled job that would
 * have to guess.
 */
export async function stalePendingMedia(): Promise<StaleMedia[]> {
  if (!isSupabaseConfigured) return [];

  try {
    const { data, error } = await supabase.rpc('stale_pending_media', {
      older_than: '1 hour',
    });

    if (error !== null) {
      toAppError(error, 'find stale media');
      return [];
    }

    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      entryId: row.entry_id as string,
      storagePath: row.storage_path as string,
    }));
  } catch (error) {
    toAppError(error, 'find stale media');
    return [];
  }
}

export interface ReconcileReport {
  retried: number;
  abandoned: number;
}

/**
 * Finishes, or gives up on, uploads that were interrupted.
 *
 * If the device still holds the file, send it again — this is the ordinary
 * case, a recording made and then backgrounded before it finished. If the file
 * is gone, the row is marked `failed` rather than left pending forever: a
 * permanent `pending` is indistinguishable from an upload still in progress,
 * and something has to be able to tell the difference.
 */
export async function reconcilePendingMedia(
  context: MediaContext,
  localUriFor: (entryId: string) => string | undefined,
): Promise<ReconcileReport> {
  const stale = await stalePendingMedia();
  let retried = 0;
  let abandoned = 0;

  for (const row of stale) {
    const localUri = localUriFor(row.entryId);

    if (localUri === undefined) {
      await supabase.from('entry_media').update({ status: 'failed' }).eq('id', row.id);
      abandoned += 1;
      continue;
    }

    const result = await uploadRecording(row.entryId, localUri, undefined, context);
    if (result.ok) retried += 1;
  }

  if (retried > 0 || abandoned > 0) {
    logger.info('Reconciled interrupted uploads', { retried, abandoned });
  }

  return { retried, abandoned };
}
