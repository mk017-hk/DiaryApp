import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { toDateKey } from '@/lib/date';
import { logger } from '@/services/logger';

/**
 * Entries, on the device.
 *
 * This is the authority for everything the screens read. Not a cache in front
 * of Postgres — the other way round: writes land here first and are pushed
 * afterwards, so capture never waits on a connection and an entry cannot be
 * lost to a dropped signal. In a product where the thing being written might
 * be the only record of a day someone will want back in ten years, that is not
 * a performance decision.
 *
 * Ids are generated here rather than by the database, so the local row and the
 * remote row are the same row from the moment it exists. Nothing has to be
 * reconciled later, and an entry written in flight mode already knows its own
 * name.
 *
 * The sync engine in `sync.ts` drives the rest; this file owns the storage and
 * nothing else touches AsyncStorage for entries.
 */

const KEY = 'entries.v1';

export interface Entry {
  id: string;
  /** 'YYYY-MM-DD' — the day the moment belongs to. */
  entryDate: string;
  entryAt: string;
  body: string;
  mood: number | null;
  emotions: string[];
  /** Local file URI of a recorded video, if there is one. */
  videoUri?: string;
  /** First frame, for lists. Video is never streamed just to render a row. */
  posterUri?: string;
  /** What was said, once transcription exists. Separate from the note. */
  transcript?: string;

  /**
   * The story this belongs to, if it belongs to one.
   *
   * The database enforces that a thread and its entries share a diary, through
   * a composite foreign key, so a forged id is rejected by Postgres rather
   * than trusted from the client.
   */
  threadId?: string;

  /**
   * Held back from the assistant, on its own.
   *
   * Separate from a private thread: one difficult entry inside an otherwise
   * ordinary story should be excludable without hiding the story. Enforced
   * server-side in `assistant_context`; this is the copy of the flag the
   * screens set.
   */
  aiExcluded?: boolean;

  /**
   * Where the recording lives in the bucket.
   *
   * How a second device plays a video it never recorded: it has no file, so it
   * mints a signed URL from this instead. Bookkeeping about a remote fact,
   * kept here because this is where the entry is — never sent to the server,
   * which already knows.
   */
  remoteVideoPath?: string;
  remotePosterPath?: string;

  isFavourite: boolean;
  createdAt: string;
  updatedAt: string;

  // --- sync state, never shown to anyone ---------------------------------

  /**
   * Deleted here, not yet confirmed gone there.
   *
   * A tombstone rather than an immediate removal: deleting the row outright
   * would leave nothing to tell the server, and the entry would reappear on
   * the next pull. Screens filter these out, so it is invisible either way.
   */
  deletedAt?: string;

  /**
   * Carries changes the server has not accepted yet.
   *
   * Defaults to true for anything read back without the field, which is every
   * entry written before sync existed. They have genuinely never been pushed.
   */
  unsynced?: boolean;
}

export type NewEntry = Omit<Entry, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'unsynced'>;

/** Everything on the device, tombstones included. Only sync wants these. */
async function readAll(): Promise<Entry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return (parsed as Entry[]).map((entry) => ({
      ...entry,
      // An entry stored before sync existed has never been pushed.
      unsynced: entry.unsynced ?? true,
    }));
  } catch (error) {
    logger.error('Could not read entries', { error });
    return [];
  }
}

async function writeAll(entries: Entry[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(entries));
  notify();
}

/**
 * Who to tell when entries change.
 *
 * Screens load on focus, which was enough while every write came from a tap on
 * that same screen. A sync pass lands while you are looking at Today, so
 * without this the entry you just wrote on your other phone sits on the device
 * and does not appear until you navigate away and back.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToEntries(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      // One screen throwing must not stop the others being told.
      logger.error('Entry listener failed', { error });
    }
  }
}

/** What the screens see: no tombstones, newest first. */
async function readVisible(): Promise<Entry[]> {
  const entries = await readAll();
  return entries
    .filter((entry) => entry.deletedAt === undefined)
    .sort((a, b) => b.entryAt.localeCompare(a.entryAt));
}

export async function listEntries(): Promise<Entry[]> {
  return readVisible();
}

export async function entriesForDate(dateKey: string): Promise<Entry[]> {
  return (await readVisible()).filter((entry) => entry.entryDate === dateKey);
}

/** Which days have something written on them — drives the calendar dots. */
export async function datesWithEntries(): Promise<Set<string>> {
  return new Set((await readVisible()).map((entry) => entry.entryDate));
}

export async function getEntry(id: string): Promise<Entry | null> {
  return (await readVisible()).find((entry) => entry.id === id) ?? null;
}

export async function createEntry(input: NewEntry): Promise<Entry> {
  const now = new Date().toISOString();
  const entry: Entry = {
    ...input,
    id: Crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    unsynced: true,
  };

  const entries = await readAll();
  await writeAll([entry, ...entries]);
  return entry;
}

export async function updateEntry(id: string, patch: Partial<NewEntry>): Promise<Entry | null> {
  const entries = await readAll();
  const index = entries.findIndex((entry) => entry.id === id && entry.deletedAt === undefined);
  if (index === -1) return null;

  const existing = entries[index]!;
  const updated: Entry = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
    unsynced: true,
  };
  entries[index] = updated;
  await writeAll(entries);
  return updated;
}

/**
 * Deletes an entry.
 *
 * Leaves a tombstone so the deletion can be told to the server, and so a pull
 * that has not caught up yet cannot bring it back. `purgeEntries` removes it
 * for good once the server has agreed.
 */
export async function deleteEntry(id: string): Promise<void> {
  const entries = await readAll();
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return;

  const now = new Date().toISOString();
  entries[index] = { ...entries[index]!, deletedAt: now, updatedAt: now, unsynced: true };
  await writeAll(entries);
}

/**
 * Removes every entry from this device.
 *
 * For signing out and for deleting an account — no tombstones, because there
 * is nobody left to tell. Recorded video does not live in AsyncStorage, so
 * `deleteAllRecordings` in the media module has to run alongside this; the two
 * together are what actually empties the device.
 */
export async function clearEntries(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/** Entries from this day in previous years. */
export async function onThisDay(today: Date = new Date()): Promise<Entry[]> {
  const month = today.getMonth();
  const day = today.getDate();
  const todayKey = toDateKey(today);

  return (await readVisible()).filter((entry) => {
    if (entry.entryDate === todayKey) return false;
    const [, m, d] = entry.entryDate.split('-').map(Number);
    return (m ?? 0) - 1 === month && d === day;
  });
}

// ---------------------------------------------------------------------------
// For the sync engine
// ---------------------------------------------------------------------------

/** Everything, tombstones included. */
export async function allEntries(): Promise<Entry[]> {
  return readAll();
}

/** Only what still needs pushing. */
export async function unsyncedEntries(): Promise<Entry[]> {
  return (await readAll()).filter((entry) => entry.unsynced === true);
}

/**
 * Writes rows that came from the server.
 *
 * Two rules, and both had to be learned the hard way.
 *
 * **An older row never overwrites a newer one.** The comparison is on
 * `updatedAt` alone — the same last-write-wins rule the database enforces, so
 * both ends reach the same answer without negotiating. It deliberately does
 * *not* also ask whether the local row is still queued: a pull can return a
 * row older than one this device pushed moments earlier, because the pull
 * bound overlaps on purpose, and a version of this that trusted the server
 * whenever the local row was clean would quietly undo the edit that had just
 * been accepted.
 *
 * **Media pointers are local and survive.** `videoUri` and `posterUri` name
 * files on this particular phone; the server has no opinion about them and
 * sends none. Taking a remote row wholesale would therefore blank them, and
 * the device that recorded the video would be the one that lost it.
 */
export async function applyRemote(incoming: Entry[]): Promise<void> {
  if (incoming.length === 0) return;

  const entries = await readAll();
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  for (const remote of incoming) {
    const local = byId.get(remote.id);

    if (local !== undefined && local.updatedAt > remote.updatedAt) continue;

    byId.set(remote.id, {
      ...remote,
      ...(local?.videoUri !== undefined ? { videoUri: local.videoUri } : {}),
      ...(local?.posterUri !== undefined ? { posterUri: local.posterUri } : {}),
      ...(local?.transcript !== undefined && remote.transcript === undefined
        ? { transcript: local.transcript }
        : {}),
      // The server does know these, so it wins where it has an opinion.
      ...(remote.remoteVideoPath === undefined && local?.remoteVideoPath !== undefined
        ? { remoteVideoPath: local.remoteVideoPath }
        : {}),
      ...(remote.remotePosterPath === undefined && local?.remotePosterPath !== undefined
        ? { remotePosterPath: local.remotePosterPath }
        : {}),
      unsynced: false,
    });
  }

  await writeAll([...byId.values()]);
}

/**
 * Records where an entry's recording ended up in the bucket.
 *
 * Deliberately does not touch `updatedAt` or mark the entry unsynced. These
 * paths live in `entry_media`, not on the entry, so the server has nothing to
 * learn here — and bumping the timestamp would push a no-op edit that could
 * beat a real edit made on another device.
 */
export async function markMediaUploaded(
  id: string,
  paths: { storagePath: string; posterPath: string | null },
): Promise<void> {
  const entries = await readAll();
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return;

  entries[index] = {
    ...entries[index]!,
    remoteVideoPath: paths.storagePath,
    ...(paths.posterPath !== null ? { remotePosterPath: paths.posterPath } : {}),
  };

  await writeAll(entries);
}

/** Entries whose recording is still only on this phone. */
export async function entriesNeedingUpload(): Promise<Entry[]> {
  return (await readAll()).filter(
    (entry) =>
      entry.deletedAt === undefined &&
      entry.videoUri !== undefined &&
      entry.remoteVideoPath === undefined,
  );
}

/** Marks rows the server has accepted, so they stop being pushed. */
export async function markSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const accepted = new Set(ids);
  const entries = await readAll();
  await writeAll(
    entries.map((entry) => (accepted.has(entry.id) ? { ...entry, unsynced: false } : entry)),
  );
}

/** Drops tombstones the server has confirmed. Nothing left to tell anyone. */
export async function purgeEntries(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const gone = new Set(ids);
  const entries = await readAll();
  await writeAll(entries.filter((entry) => !gone.has(entry.id)));
}
