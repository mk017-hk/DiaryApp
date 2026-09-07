import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppError } from '@/services/supabase/errors';

import { applyRemote, markSynced, purgeEntries, unsyncedEntries, type Entry } from './entryStore';

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

export interface SyncRemote {
  push(entries: Entry[]): Promise<RemoteResult<PushOutcome>>;
  pull(since: string | null): Promise<RemoteResult<PullOutcome>>;
}

export interface SyncReport {
  status: 'ok' | 'failed' | 'busy';
  pushed: number;
  pulled: number;
  /** Tombstones dropped: confirmed by the server, or deleted on another device. */
  removed: number;
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
  if (inFlight !== null) return { status: 'busy', pushed: 0, pulled: 0, removed: 0 };

  inFlight = runSync(remote, options).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

async function runSync(remote: SyncRemote, options: SyncOptions): Promise<SyncReport> {
  let pushed = 0;
  let removed = 0;

  // --- push ---------------------------------------------------------------
  const queued = await unsyncedEntries();

  if (queued.length > 0) {
    const result = await remote.push(queued);
    if (!result.ok) {
      // Everything stays queued. Being offline is not a failure to report at
      // the user; it is Tuesday.
      return { status: 'failed', pushed: 0, pulled: 0, removed: 0, error: result.error };
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
    return { status: 'failed', pushed, pulled: 0, removed, error: pull.error };
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

  return { status: 'ok', pushed, pulled: entries.length, removed };
}

/** Test seam: clears the in-flight guard between cases. */
export const __testing = {
  reset: () => {
    inFlight = null;
  },
};
