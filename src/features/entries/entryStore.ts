import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { toDateKey } from '@/lib/date';
import { logger } from '@/services/logger';

import { isQuietDate } from './muteStore';
import { listThreads } from './threadStore';

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

/**
 * What a diary can hold besides words.
 *
 * Video is the one the product is built around, but the concept always listed
 * four formats and `entry_media` has always been a list with a `kind` and a
 * `position`. This is that list, on the device.
 */
export type MediaKind = 'video' | 'photo' | 'audio';

export interface EntryMedia {
  /**
   * Generated on the device, like the entry's own id.
   *
   * It is what the bucket path is keyed on, so a retry overwrites rather than
   * duplicating, and what `markMediaUploaded` names when it records where a
   * file ended up.
   */
  id: string;
  kind: MediaKind;
  /** The file on this phone, if this is the phone it was made on. */
  uri?: string;
  /** A still, so a list never has to stream. Video only. */
  posterUri?: string;
  /**
   * Where it lives in the bucket.
   *
   * How a second device plays something it never recorded: no file, so it
   * mints a signed URL from this instead. Bookkeeping about a remote fact.
   */
  remotePath?: string;
  remotePosterPath?: string;
  durationMs?: number;
}

export interface Entry {
  id: string;
  /** 'YYYY-MM-DD' — the day the moment belongs to. */
  entryDate: string;
  entryAt: string;
  body: string;
  mood: number | null;
  emotions: string[];
  /** Video, photos and voice notes, in the order they were added. */
  media: EntryMedia[];
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
   * Never handed back as a memory.
   *
   * Deliberately not the same flag as `aiExcluded`, because they are not the
   * same sentence. "Never read this" and "never bring this back to me" are
   * both reasonable on their own, and so is either without the other.
   */
  resurfaceExcluded?: boolean;

  /**
   * Readable only by its author, even inside a shared diary.
   *
   * Two people keeping a record of something hard still need a page the other
   * cannot read; without this the only way to keep one difficult entry private
   * is not to write it. Enforced by the select policy in Postgres, not here.
   */
  isPersonal?: boolean;

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

/** The video on an entry, if it has one. Most screens want exactly this. */
export function videoOf(entry: Entry): EntryMedia | undefined {
  return entry.media.find((item) => item.kind === 'video');
}

export function photosOf(entry: Entry): EntryMedia[] {
  return entry.media.filter((item) => item.kind === 'photo');
}

export function audioOf(entry: Entry): EntryMedia | undefined {
  return entry.media.find((item) => item.kind === 'audio');
}

/** Whether a piece of media is reachable at all, here or in the bucket. */
export function hasSomewhereToPlayFrom(item: EntryMedia): boolean {
  return item.uri !== undefined || item.remotePath !== undefined;
}

/**
 * The shape entries had before media became a list.
 *
 * Kept only so a phone that has been sitting on an older build does not lose
 * the video on every entry the first time it reads them back.
 */
interface LegacyMediaFields {
  videoUri?: string;
  posterUri?: string;
  remoteVideoPath?: string;
  remotePosterPath?: string;
}

function migrateMedia(entry: Entry & LegacyMediaFields): EntryMedia[] {
  if (Array.isArray(entry.media)) return entry.media;

  const legacy = entry.videoUri ?? entry.remoteVideoPath;
  if (legacy === undefined) return [];

  return [
    {
      // Keyed on the entry, which is what the old bucket path used, so an
      // already-uploaded video keeps pointing at the object it is in.
      id: entry.id,
      kind: 'video',
      ...(entry.videoUri !== undefined ? { uri: entry.videoUri } : {}),
      ...(entry.posterUri !== undefined ? { posterUri: entry.posterUri } : {}),
      ...(entry.remoteVideoPath !== undefined ? { remotePath: entry.remoteVideoPath } : {}),
      ...(entry.remotePosterPath !== undefined ? { remotePosterPath: entry.remotePosterPath } : {}),
    },
  ];
}

/** Everything on the device, tombstones included. Only sync wants these. */
async function readAll(): Promise<Entry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return (parsed as (Entry & LegacyMediaFields)[]).map((entry) => ({
      ...entry,
      media: migrateMedia(entry),
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

/**
 * Entries from this day in previous years, minus everything she asked to be
 * left out of.
 *
 * Three mutes apply, and they are different requests: this entry, this story,
 * these dates. The same three are enforced in `resurfacing_candidates` in SQL,
 * because the scheduled job that will eventually send the notification is not
 * this app — but the device is the authority for what the screens show, so the
 * rules have to hold in both places or the card and the notification disagree.
 *
 * A quiet date suppresses the whole day rather than part of it. That is
 * deliberately blunt: a mute that returned "some of it" would be a mute that
 * still surprises her.
 */
export async function onThisDay(today: Date = new Date()): Promise<Entry[]> {
  if (await isQuietDate(today)) return [];

  const month = today.getMonth();
  const day = today.getDate();
  const todayKey = toDateKey(today);
  const muted = new Set(
    (await listThreads()).filter((thread) => thread.resurfaceMuted === true).map(({ id }) => id),
  );

  return (await readVisible()).filter((entry) => {
    if (entry.entryDate === todayKey) return false;
    if (entry.resurfaceExcluded === true) return false;
    if (entry.threadId !== undefined && muted.has(entry.threadId)) return false;

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
      media: mergeMedia(local?.media ?? [], remote.media),
      ...(local?.transcript !== undefined && remote.transcript === undefined
        ? { transcript: local.transcript }
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
  entryId: string,
  mediaId: string,
  paths: { storagePath: string; posterPath: string | null },
): Promise<void> {
  const entries = await readAll();
  const index = entries.findIndex((entry) => entry.id === entryId);
  if (index === -1) return;

  const entry = entries[index]!;
  entries[index] = {
    ...entry,
    media: entry.media.map((item) =>
      item.id === mediaId
        ? {
            ...item,
            remotePath: paths.storagePath,
            ...(paths.posterPath !== null ? { remotePosterPath: paths.posterPath } : {}),
          }
        : item,
    ),
  };

  await writeAll(entries);
}

/** Entries whose recording is still only on this phone. */
export interface PendingUpload {
  entryId: string;
  item: EntryMedia;
}

/** Every file that is still only on this phone, oldest entry first. */
export async function mediaNeedingUpload(): Promise<PendingUpload[]> {
  const entries = await readAll();

  return entries
    .filter((entry) => entry.deletedAt === undefined)
    .flatMap((entry) =>
      entry.media
        .filter((item) => item.uri !== undefined && item.remotePath === undefined)
        .map((item) => ({ entryId: entry.id, item })),
    );
}

/**
 * Merges a pulled entry's media with what this device already knows.
 *
 * Both halves carry something the other does not. The server knows the bucket
 * paths and is authoritative about them; the device knows where the file
 * actually sits on this phone, which the server has no opinion about and never
 * will. Taking either side wholesale loses the other — and the device that
 * recorded the video would be the one to lose it.
 */
function mergeMedia(local: EntryMedia[], remote: EntryMedia[]): EntryMedia[] {
  const byId = new Map(local.map((item) => [item.id, item]));

  for (const item of remote) {
    const here = byId.get(item.id);
    byId.set(item.id, {
      ...item,
      ...(here?.uri !== undefined ? { uri: here.uri } : {}),
      ...(here?.posterUri !== undefined ? { posterUri: here.posterUri } : {}),
      // A local path the server has not caught up with yet still beats nothing.
      ...(item.remotePath === undefined && here?.remotePath !== undefined
        ? { remotePath: here.remotePath }
        : {}),
      ...(item.remotePosterPath === undefined && here?.remotePosterPath !== undefined
        ? { remotePosterPath: here.remotePosterPath }
        : {}),
    });
  }

  return [...byId.values()];
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
