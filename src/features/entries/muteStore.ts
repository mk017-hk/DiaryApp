import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { logger } from '@/services/logger';

/**
 * Quiet dates: the parts of the calendar resurfacing never reaches into.
 *
 * The app's most useful feature and its most dangerous one are the same
 * feature. "Two years ago today" is what makes this an archive rather than a
 * notebook, and it is also entirely capable of handing someone the worst
 * morning of her year without being asked. The app cannot know which mornings
 * those are. She can.
 *
 * A per-entry flag cannot express this, which is the whole reason this exists:
 * the entries a mute protects her from have not been written yet. Someone
 * muting the week around a due date is muting next August, and every August
 * after it.
 *
 * So a mute is a month and a day at each end, not a pair of dates. Storing
 * dates would mean the mute quietly expiring before the morning it was set up
 * for — a bug whose only symptom is the thing it was built to prevent.
 *
 * Local-first like everything else, and synced, because a boundary that only
 * holds on the phone it was set on is not a boundary.
 */

const KEY = 'resurfacingMutes.v1';

export interface QuietDates {
  id: string;
  /** 1-12. */
  fromMonth: number;
  /** 1-31. */
  fromDay: number;
  toMonth: number;
  toDay: number;
  /**
   * Optional, and never asked for twice.
   *
   * Being made to write down why is its own small cost, on precisely the
   * subject where that cost is highest.
   */
  label?: string;
  createdAt: string;
  updatedAt: string;
  /** Set locally, gone there. The sync engine's business. */
  deletedAt?: string;
  unsynced?: boolean;
}

export type NewQuietDates = Omit<
  QuietDates,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'unsynced'
>;

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToMutes(listener: Listener): () => void {
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
      logger.error('Mute listener failed', { error });
    }
  }
}

async function readAll(): Promise<QuietDates[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return (parsed as QuietDates[]).map((mute) => ({ ...mute, unsynced: mute.unsynced ?? true }));
  } catch (error) {
    logger.error('Could not read quiet dates', { error });
    return [];
  }
}

async function writeAll(mutes: QuietDates[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(mutes));
  notify();
}

/**
 * The mutes in force, soonest in the year first.
 *
 * A wrapping range sorts by where it starts, which puts "28 December to 3
 * January" at the end of the list where someone reading down the year would
 * look for it.
 */
export async function listQuietDates(): Promise<QuietDates[]> {
  return (await readAll())
    .filter((mute) => mute.deletedAt === undefined)
    .sort((a, b) => a.fromMonth * 100 + a.fromDay - (b.fromMonth * 100 + b.fromDay));
}

export async function addQuietDates(input: NewQuietDates): Promise<QuietDates> {
  const now = new Date().toISOString();
  const mute: QuietDates = {
    ...input,
    id: Crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    unsynced: true,
  };

  await writeAll([mute, ...(await readAll())]);
  return mute;
}

/**
 * Lifts a mute.
 *
 * A tombstone rather than a removal, for the same reason entries use one: the
 * other phone has to be able to learn that it is gone. Until it syncs, it is
 * already gone here — lifting a mute should take effect at the moment she asks,
 * not when the network agrees.
 */
export async function removeQuietDates(id: string): Promise<void> {
  const mutes = await readAll();
  const index = mutes.findIndex((mute) => mute.id === id);
  if (index === -1) return;

  mutes[index] = {
    ...(mutes[index] as QuietDates),
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    unsynced: true,
  };

  await writeAll(mutes);
}

export async function clearQuietDates(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/**
 * Whether a date falls inside a mute.
 *
 * Ranges may wrap the new year, in which case the range is the union of its two
 * halves rather than the empty span between them. Compared as MMDD, so no date
 * arithmetic and no year to get wrong.
 */
export function isWithin(mute: QuietDates, month: number, day: number): boolean {
  const at = month * 100 + day;
  const from = mute.fromMonth * 100 + mute.fromDay;
  const to = mute.toMonth * 100 + mute.toDay;

  return from <= to ? at >= from && at <= to : at >= from || at <= to;
}

/**
 * A range of days either side of one date.
 *
 * What someone actually asks for is "the week around the 28th", not four
 * numbers, so the screen asks for a date and a width and this turns it into the
 * stored shape. Arbitrary ranges remain expressible — this is the common case,
 * not the only one.
 *
 * The arithmetic runs in a leap year so that 29 February is a date that exists,
 * and only the month and day are kept, so a span running off either end of
 * December lands in January without any special case.
 */
export function rangeAround(
  month: number,
  day: number,
  spreadDays: number,
): Pick<QuietDates, 'fromMonth' | 'fromDay' | 'toMonth' | 'toDay'> {
  const LEAP_YEAR = 2024;
  const from = new Date(LEAP_YEAR, month - 1, day - spreadDays);
  const to = new Date(LEAP_YEAR, month - 1, day + spreadDays);

  return {
    fromMonth: from.getMonth() + 1,
    fromDay: from.getDate(),
    toMonth: to.getMonth() + 1,
    toDay: to.getDate(),
  };
}

/** Whether resurfacing should stay away from this date entirely. */
export async function isQuietDate(date: Date): Promise<boolean> {
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return (await listQuietDates()).some((mute) => isWithin(mute, month, day));
}

// ---------------------------------------------------------------------------
// For the sync engine
// ---------------------------------------------------------------------------

/** Everything, tombstones included. */
export async function allQuietDates(): Promise<QuietDates[]> {
  return readAll();
}

export async function unsyncedQuietDates(): Promise<QuietDates[]> {
  return (await readAll()).filter((mute) => mute.unsynced === true);
}

/**
 * Writes the mutes the account holds.
 *
 * `incoming` is the complete set, not a delta, so absence carries meaning: a
 * mute this device has already pushed and that the account no longer has was
 * lifted on another phone, and keeping it would mean a mute that cannot be
 * lifted from the device that did not lift it.
 *
 * A mute written here and not yet pushed is of course absent too, and must
 * survive — an empty first pull on a new phone would otherwise delete the quiet
 * dates somebody had just set up.
 */
export async function applyRemoteQuietDates(incoming: QuietDates[]): Promise<void> {
  const remoteById = new Map(incoming.map((mute) => [mute.id, mute]));
  const merged: QuietDates[] = [];

  for (const local of await readAll()) {
    const remote = remoteById.get(local.id);

    if (remote === undefined) {
      // Never pushed, so the account has simply not heard of it yet.
      if (local.unsynced === true) merged.push(local);
      continue;
    }

    remoteById.delete(local.id);
    merged.push(local.updatedAt > remote.updatedAt ? local : { ...remote, unsynced: false });
  }

  for (const remote of remoteById.values()) merged.push({ ...remote, unsynced: false });

  await writeAll(merged);
}

export async function markQuietDatesSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const accepted = new Set(ids);
  const mutes = await readAll();

  // A tombstone the server has accepted has nothing left to say, so it goes
  // rather than sitting on the device forever.
  await writeAll(
    mutes
      .filter((mute) => !(accepted.has(mute.id) && mute.deletedAt !== undefined))
      .map((mute) => (accepted.has(mute.id) ? { ...mute, unsynced: false } : mute)),
  );
}
