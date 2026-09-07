import type { Entry } from '@/features/entries/entryStore';

import { isSupabaseConfigured, supabase } from './client';
import { emotionIndex, replaceEntryEmotions } from './emotions';
import { AppError, toAppError } from './errors';

/**
 * Entries, in Postgres.
 *
 * The counterpart to the device store, not a replacement for it. Screens never
 * call this — the sync engine does, in both directions, and the device stays
 * the thing you read from.
 *
 * Everything here is written so that being offline is ordinary rather than
 * exceptional: a push carries the time the edit was made, not the time it
 * arrived, and the database decides who wins. See the trigger in
 * `20260907000001_entry_sync.sql`.
 */

export interface SyncContext {
  diaryId: string;
  userId: string;
}

/** A row of `journal_entries`, as the columns this app writes and reads. */
interface EntryRow {
  id: string;
  diary_id: string;
  author_id: string;
  thread_id: string | null;
  ai_excluded: boolean;
  body: string | null;
  entry_date: string;
  entry_at: string;
  mood: number | null;
  is_favourite: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A row as it comes back from a pull.
 *
 * Kept separate from what gets written: `entry_media` is embedded on read so
 * one request answers "what changed?" and "where is the video?" together, but
 * sending it back would be an excess column on an upsert. RLS applies to the
 * embed exactly as it does to a direct select, so it cannot reach media in
 * another diary.
 */
interface EntryRowWithMedia extends EntryRow {
  entry_media?: { storage_path: string; poster_path: string | null; status: string }[];
  entry_emotions?: { emotion_id: string }[];
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/**
 * A device entry as a row.
 *
 * `updated_at` is sent deliberately. It is the whole basis of conflict
 * resolution: it says when this edit was made, which on a phone that has been
 * in a tunnel for an hour is not remotely the same as now.
 *
 * Columns this app does not own yet — `title`, `people`, `location_label` —
 * are left out rather than sent as null. PostgREST only updates the columns
 * present, so omitting them preserves whatever else has set them.
 */
export function toRow(entry: Entry, context: SyncContext): EntryRow {
  return {
    id: entry.id,
    diary_id: context.diaryId,
    author_id: context.userId,
    thread_id: entry.threadId ?? null,
    ai_excluded: entry.aiExcluded ?? false,
    body: entry.body,
    entry_date: entry.entryDate,
    entry_at: entry.entryAt,
    mood: entry.mood,
    is_favourite: entry.isFavourite,
    deleted_at: entry.deletedAt ?? null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

/**
 * A row as a device entry.
 *
 * Media is not here. `videoUri` and `posterUri` point at files on one
 * particular phone and mean nothing on another, so they are never sent and
 * never overwritten by a pull — the media module deals in storage paths
 * instead, and a device that has the file keeps using the file.
 *
 * `slugById` translates the emotion ids a pull returns. Passed in rather than
 * fetched so this stays pure and testable; the ids are per-project and mean
 * nothing on a device, which is why entries store slugs.
 */
export function fromRow(row: EntryRowWithMedia, slugById?: Map<string, string>): Entry {
  const entry: Entry = {
    id: row.id,
    entryDate: row.entry_date,
    entryAt: row.entry_at,
    body: row.body ?? '',
    mood: row.mood,
    emotions: [],
    isFavourite: row.is_favourite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    unsynced: false,
  };

  if (row.deleted_at !== null) entry.deletedAt = row.deleted_at;
  if (row.thread_id !== null) entry.threadId = row.thread_id;
  if (row.ai_excluded) entry.aiExcluded = true;

  if (row.entry_emotions !== undefined && slugById !== undefined) {
    entry.emotions = row.entry_emotions
      .map((item) => slugById.get(item.emotion_id))
      .filter((slug): slug is string => slug !== undefined);
  }

  // Only a finished upload counts. A `pending` row means the bytes may not be
  // there yet, and pointing a second device at a half-written object gives it
  // a broken player rather than an honest "not here yet".
  const media = row.entry_media?.find((item) => item.status === 'uploaded');
  if (media !== undefined) {
    entry.remoteVideoPath = media.storage_path;
    if (media.poster_path !== null) entry.remotePosterPath = media.poster_path;
  }

  return entry;
}

const COLUMNS =
  'id, diary_id, author_id, thread_id, ai_excluded, body, entry_date, entry_at, mood, is_favourite, deleted_at, created_at, updated_at';

/** The push writes only `journal_entries`, so it asks for nothing else back. */
const SELECT = COLUMNS;

/** The pull wants the media paths too, in the same round trip. */
const SELECT_WITH_MEDIA = `${COLUMNS}, entry_media(storage_path, poster_path, status), entry_emotions(emotion_id)`;

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

export interface PushOutcome {
  /** What the server holds now, for every row we sent. Adopt these locally. */
  accepted: Entry[];
  /** Ids the server confirmed as deleted. Safe to drop from the device. */
  deleted: string[];
}

/**
 * Sends local changes.
 *
 * One upsert for everything, tombstones included — a row deleted before it was
 * ever pushed is just an insert that arrives already deleted, which saves
 * having to care whether the server has seen it before.
 *
 * What comes back is the state after the database applied its own rules, so a
 * push that lost to a newer edit returns the winner rather than an error. The
 * caller writes that straight back to the device, and both ends agree without
 * a second round trip.
 */
export async function pushEntries(
  entries: Entry[],
  context: SyncContext,
): Promise<{ ok: true; value: PushOutcome } | { ok: false; error: AppError }> {
  if (entries.length === 0) return { ok: true, value: { accepted: [], deleted: [] } };
  if (!isSupabaseConfigured) {
    return { ok: false, error: new AppError('unknown', 'No account service in this build.') };
  }

  try {
    const { data, error } = await supabase
      .from('journal_entries')
      .upsert(
        entries.map((entry) => toRow(entry, context)),
        { onConflict: 'id' },
      )
      .select(SELECT);

    if (error !== null) return { ok: false, error: toAppError(error, 'push entries') };

    const rows = (data ?? []) as unknown as EntryRow[];
    const accepted = rows.map((row) => fromRow(row));

    // Emotions live in a join table, so they are a second write. It happens
    // after the entries exist — the composite key is (entry_id, diary_id), so
    // an emotion for a row the server has not got yet is simply rejected.
    //
    // Deliberately not awaited into the result: a failure here loses a colour
    // on an entry, and must never be the reason the entry itself reports a
    // failed sync and stays queued forever.
    const alive = entries.filter((entry) => entry.deletedAt === undefined);
    if (alive.length > 0) {
      await replaceEntryEmotions(
        alive.map((entry) => ({ id: entry.id, emotions: entry.emotions })),
        context.diaryId,
      );
    }

    // The accepted rows came back without emotions — the push does not ask for
    // them. Carry across what we just sent, so adopting the server's answer
    // does not blank them on the device.
    const sentEmotions = new Map(entries.map((entry) => [entry.id, entry.emotions]));
    for (const entry of accepted) {
      entry.emotions = sentEmotions.get(entry.id) ?? [];
    }

    return {
      ok: true,
      value: {
        accepted,
        deleted: accepted.filter((entry) => entry.deletedAt !== undefined).map((entry) => entry.id),
      },
    };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'push entries') };
  }
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

export interface PullOutcome {
  entries: Entry[];
  /**
   * The newest `updated_at` seen, to ask from next time.
   *
   * Taken from the rows rather than the device clock on purpose: a phone whose
   * clock is a few minutes fast would otherwise set a watermark in the future
   * and skip everything written in between.
   */
  watermark: string | null;
}

/**
 * Fetches everything in the diary touched since `since`.
 *
 * Deleted rows are included — a tombstone is the only way a second device
 * learns that something was deleted, and filtering them out here is how you
 * end up with an entry that will not stay deleted.
 *
 * The bound is inclusive, so the row that set the last watermark comes back
 * again. Re-applying an identical row costs nothing, and an exclusive bound
 * would silently drop anything written in the same millisecond.
 */
export async function pullEntries(
  since: string | null,
  context: SyncContext,
  limit = 500,
): Promise<{ ok: true; value: PullOutcome } | { ok: false; error: AppError }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: new AppError('unknown', 'No account service in this build.') };
  }

  try {
    let query = supabase
      .from('journal_entries')
      .select(SELECT_WITH_MEDIA)
      .eq('diary_id', context.diaryId)
      .order('updated_at', { ascending: true })
      .limit(limit);

    if (since !== null) query = query.gte('updated_at', since);

    const { data, error } = await query;
    if (error !== null) return { ok: false, error: toAppError(error, 'pull entries') };

    const rows = (data ?? []) as unknown as EntryRowWithMedia[];
    const { slugById } = await emotionIndex();
    const entries = rows.map((row) => fromRow(row, slugById));
    const watermark = rows.length === 0 ? null : (rows[rows.length - 1]?.updated_at ?? null);

    return { ok: true, value: { entries, watermark } };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'pull entries') };
  }
}

// ---------------------------------------------------------------------------
// Which diary
// ---------------------------------------------------------------------------

/**
 * The signed-in user's personal diary.
 *
 * Created by the `handle_new_user` trigger at sign-up, so it exists before the
 * app ever asks. RLS means this can only ever return diaries the caller is a
 * member of, so there is nothing to check here that the database has not.
 */
export async function personalDiaryId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase
      .from('diaries')
      .select('id')
      .eq('kind', 'personal')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error !== null) {
      toAppError(error, 'find diary');
      return null;
    }

    return data?.[0]?.id ?? null;
  } catch (error) {
    toAppError(error, 'find diary');
    return null;
  }
}
