import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  applyRemoteLetters,
  markSealed,
  unsentLetters,
  type Letter,
} from '@/features/letters/letterStore';
import type { AppError } from '@/services/supabase/errors';

import {
  applyRemote,
  markMediaUploaded,
  markSynced,
  mediaNeedingUpload,
  purgeEntries,
  unsyncedEntries,
  type Entry,
  type PendingUpload,
} from './entryStore';
import {
  applyRemoteQuietDates,
  markQuietDatesSynced,
  unsyncedQuietDates,
  type QuietDates,
} from './muteStore';
import { applyRemoteThreads, markThreadsSynced, unsyncedThreads, type Thread } from './threadStore';

/**
 * Getting the device and the server to agree.
 *
 * Push first, then pull. That order matters: pushing first means the server
 * has seen everything this device knows before we ask what it holds, so the
 * answer already accounts for our changes and there is no window where a pull
 * overwrites an edit that was about to be sent.
 *
 * The remote is injected rather than imported. Every interesting thing here is
 * a decision about conflicting edits, and those deserve tests that run in
 * milliseconds against a fake — not tests that need Docker to say whether a
 * stale write was discarded.
 */

const WATERMARK_KEY = 'entries.watermark.v1';

export interface PushOutcome {
  accepted: Entry[];
  deleted: string[];
}

export interface PullOutcome {
  entries: Entry[];
  watermark: string | null;
}

export type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

export interface UploadedMedia {
  storagePath: string;
  posterPath: string | null;
}

export interface SyncRemote {
  push(entries: Entry[]): Promise<RemoteResult<PushOutcome>>;
  pull(since: string | null): Promise<RemoteResult<PullOutcome>>;
  /**
   * Sends one entry's recording.
   *
   * Optional so the text path can be tested and reasoned about on its own —
   * and so a build with no media pipeline is a smaller thing, not a broken one.
   */
  uploadMedia?(pending: PendingUpload): Promise<RemoteResult<UploadedMedia>>;
  /**
   * Threads, both directions.
   *
   * Optional for the same reason media is: the entry path should be testable
   * and reasonable on its own. When present it runs *first*, because an entry
   * naming a thread the server has not got yet is rejected by the composite
   * foreign key that keeps threads and entries in the same diary.
   */
  pushThreads?(threads: Thread[]): Promise<RemoteResult<Thread[]>>;
  pullThreads?(): Promise<RemoteResult<Thread[]>>;
  /**
   * Quiet dates, both directions.
   *
   * Optional like the rest. The push returns the ids the account accepted
   * rather than rows, because half of what it sends are lifts — and a lifted
   * mute has no row to come back.
   */
  pushMutes?(mutes: QuietDates[]): Promise<RemoteResult<string[]>>;
  pullMutes?(): Promise<RemoteResult<QuietDates[]>>;
  /**
   * Letters to yourself, both directions.
   *
   * The push returns accepted ids rather than rows — the account will not hand
   * a sealed letter back, which is the point of the feature. The pull returns
   * metadata only, for the same reason.
   */
  sendLetters?(letters: Letter[]): Promise<RemoteResult<string[]>>;
  pullLetters?(): Promise<RemoteResult<{ id: string; unlockOn: string; createdAt: string }[]>>;
}

export interface SyncReport {
  status: 'ok' | 'failed' | 'busy';
  pushed: number;
  pulled: number;
  /** Tombstones dropped: confirmed by the server, or deleted on another device. */
  removed: number;
  /** Recordings that reached the bucket this pass. */
  uploaded: number;
  /** Threads pushed and pulled. */
  threads: number;
  /** Quiet dates pushed and pulled. */
  mutes: number;
  /** Letters that reached the account this pass, and so left the phone. */
  letters: number;
  error?: AppError;
}

export interface SyncOptions {
  /**
   * Called for entries that are gone for good, before they leave the device.
   *
   * This is where recorded video is deleted. Injected because the engine has
   * no business knowing about the filesystem, and because a sync test should
   * not need one.
   */
  onRemoved?: (ids: string[]) => Promise<void>;
}

export async function readWatermark(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(WATERMARK_KEY);
  } catch {
    return null;
  }
}

async function writeWatermark(value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(WATERMARK_KEY, value);
  } catch {
    // A lost watermark costs one over-wide pull, not correctness.
  }
}

/**
 * Forgets where we had got to.
 *
 * Called on sign-out. The next person to sign in on this phone must not
 * inherit a watermark from someone else's diary, or their first sync would
 * skip everything written before it.
 */
export async function resetSyncState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(WATERMARK_KEY);
  } catch {
    // Nothing useful to do, and nothing lost that a full pull cannot rebuild.
  }
}

/**
 * One pass, and never two at once.
 *
 * Foregrounding the app while a sync is already running is ordinary — the
 * guard is what stops the same entries being pushed twice and a watermark
 * being written backwards by whichever pass happens to finish second.
 */
let inFlight: Promise<SyncReport> | null = null;

export async function syncEntries(
  remote: SyncRemote,
  options: SyncOptions = {},
): Promise<SyncReport> {
  if (inFlight !== null) {
    return {
      status: 'busy',
      pushed: 0,
      pulled: 0,
      removed: 0,
      uploaded: 0,
      threads: 0,
      mutes: 0,
      letters: 0,
    };
  }

  inFlight = runSync(remote, options).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

async function runSync(remote: SyncRemote, options: SyncOptions): Promise<SyncReport> {
  let pushed = 0;
  let removed = 0;
  let uploaded = 0;

  // --- threads, first -----------------------------------------------------

  // Before entries, always. An entry naming a thread the server has not seen
  // is rejected by the composite foreign key that keeps the two in the same
  // diary — so a thread started offline has to arrive before the entries that
  // belong to it, or the whole push fails on a constraint.
  const threads = await syncThreads(remote);

  // --- quiet dates --------------------------------------------------------

  // Also before entries, and for a reason worth stating: a mute is a boundary,
  // and a pass that pulled entries first would leave a window in which this
  // device knows about a memory it does not yet know it was told to leave
  // alone. The window is small. It is also exactly the window in which the
  // resurfacing card is drawn on app launch.
  const mutes = await syncMutes(remote);

  // --- letters -------------------------------------------------------------

  // Before entries too, and for the sharpest reason of any of them: until this
  // runs, a sealed letter's body is sitting in AsyncStorage on the phone. Every
  // pass that does this first is a window closed.
  const letters = await syncLetters(remote);

  // --- push ---------------------------------------------------------------
  const queued = await unsyncedEntries();

  if (queued.length > 0) {
    const result = await remote.push(queued);
    if (!result.ok) {
      // Everything stays queued. Being offline is not a failure to report at
      // the user; it is Tuesday.
      return {
        status: 'failed',
        pushed: 0,
        pulled: 0,
        removed: 0,
        uploaded: 0,
        threads,
        mutes,
        letters,
        error: result.error,
      };
    }

    // Adopt what the server settled on. For a push that lost to a newer edit
    // this is the winning row, which is how this device finds out.
    await applyRemote(result.value.accepted);
    await markSynced(result.value.accepted.map((entry) => entry.id));

    if (result.value.deleted.length > 0) {
      await options.onRemoved?.(result.value.deleted);
      await purgeEntries(result.value.deleted);
      removed += result.value.deleted.length;
    }

    pushed = result.value.accepted.length;
  }

  // --- pull ---------------------------------------------------------------
  const since = await readWatermark();
  const pull = await remote.pull(since);

  if (!pull.ok) {
    return {
      status: 'failed',
      pushed,
      pulled: 0,
      removed,
      uploaded,
      threads,
      mutes,
      letters,
      error: pull.error,
    };
  }

  const { entries, watermark } = pull.value;

  await applyRemote(entries);

  // A tombstone from the server means it was deleted somewhere else. Take the
  // files with it: this device may be the one still holding the video.
  const tombstones = entries
    .filter((entry) => entry.deletedAt !== undefined)
    .map((entry) => entry.id);

  if (tombstones.length > 0) {
    await options.onRemoved?.(tombstones);
    await purgeEntries(tombstones);
    removed += tombstones.length;
  }

  // Written last, and only on success. A watermark saved before the rows it
  // describes have landed would skip them forever on the next pass.
  if (watermark !== null) await writeWatermark(watermark);

  // --- media --------------------------------------------------------------

  // After the rows, never before: `entry_media` has a composite foreign key on
  // (entry_id, diary_id), so the entry has to exist server-side or the media
  // row is rejected. Uploading first would also mean bytes in the bucket with
  // nothing pointing at them.
  uploaded = await uploadPendingMedia(remote);

  return {
    status: 'ok',
    pushed,
    pulled: entries.length,
    removed,
    uploaded,
    threads,
    mutes,
    letters,
  };
}

/**
 * Threads, both ways.
 *
 * No watermark and no tombstones: a person has a handful of threads, so a full
 * pull is one small request and saves an entire class of "which ones did I
 * miss" bug. Threads close rather than disappear, so there is nothing to
 * tombstone.
 *
 * Failures here do not fail the pass. A thread that has not arrived yet means
 * an entry naming it will be rejected and stay queued, which is exactly the
 * right outcome and needs no separate handling.
 */
async function syncThreads(remote: SyncRemote): Promise<number> {
  let touched = 0;

  if (remote.pushThreads !== undefined) {
    const queued = await unsyncedThreads();
    if (queued.length > 0) {
      const result = await remote.pushThreads(queued);
      if (result.ok) {
        await applyRemoteThreads(result.value);
        await markThreadsSynced(result.value.map((thread) => thread.id));
        touched += result.value.length;
      }
    }
  }

  if (remote.pullThreads !== undefined) {
    const result = await remote.pullThreads();
    if (result.ok) {
      await applyRemoteThreads(result.value);
      touched += result.value.length;
    }
  }

  return touched;
}

/**
 * Quiet dates, both ways.
 *
 * Like threads: no watermark, because there are a handful of these and a full
 * pull costs one small request. Unlike threads, the pull is authoritative —
 * absence means lifted elsewhere, which is the only way a lift reaches the
 * phone that did not make it.
 *
 * Failures do not fail the pass, with one consequence worth naming: a mute set
 * offline protects this device immediately and the other one only once a pass
 * succeeds. The alternative — refusing to save a mute until the network agrees —
 * would be worse, since the moment somebody sets one is not a moment to make
 * them wait.
 */
async function syncMutes(remote: SyncRemote): Promise<number> {
  let touched = 0;

  if (remote.pushMutes !== undefined) {
    const queued = await unsyncedQuietDates();
    if (queued.length > 0) {
      const result = await remote.pushMutes(queued);
      if (result.ok) {
        await markQuietDatesSynced(result.value);
        touched += result.value.length;
      }
    }
  }

  if (remote.pullMutes !== undefined) {
    const result = await remote.pullMutes();
    if (result.ok) {
      await applyRemoteQuietDates(result.value);
      touched += result.value.length;
    }
  }

  return touched;
}

/**
 * Letters, both ways.
 *
 * The push is the moment a letter becomes sealed: the account accepts the body,
 * and `markSealed` drops it from the device. Until then the seal is a promise
 * about the future rather than a fact, and the screen says so in those words.
 *
 * The pull brings back metadata for letters written on another phone — when
 * each opens, and nothing else, because that is all the account will say about
 * a sealed one.
 */
async function syncLetters(remote: SyncRemote): Promise<number> {
  let sent = 0;

  if (remote.sendLetters !== undefined) {
    const queued = await unsentLetters();
    if (queued.length > 0) {
      const result = await remote.sendLetters(queued);
      if (result.ok) {
        await markSealed(result.value);
        sent = result.value.length;
      }
    }
  }

  if (remote.pullLetters !== undefined) {
    const result = await remote.pullLetters();
    if (result.ok) await applyRemoteLetters(result.value);
  }

  return sent;
}

/**
 * Sends recordings that are still only on this phone.
 *
 * One at a time and deliberately not in parallel: these are hundred-megabyte
 * files on a mobile connection, and three at once is how you get three
 * timeouts instead of one success. A failure stops the pass rather than
 * grinding through the rest — whatever went wrong for the first will almost
 * certainly go wrong for the second, and the queue keeps until next time.
 */
async function uploadPendingMedia(remote: SyncRemote): Promise<number> {
  if (remote.uploadMedia === undefined) return 0;

  const waiting = await mediaNeedingUpload();
  let uploaded = 0;

  for (const pending of waiting) {
    const result = await remote.uploadMedia(pending);
    if (!result.ok) break;

    await markMediaUploaded(pending.entryId, pending.item.id, result.value);
    uploaded += 1;
  }

  return uploaded;
}

/** Test seam: clears the in-flight guard between cases. */
export const __testing = {
  reset: () => {
    inFlight = null;
  },
};
