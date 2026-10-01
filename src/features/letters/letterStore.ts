import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { logger } from '@/services/logger';

/**
 * Letters to yourself, on the device.
 *
 * The one part of this app that is not local-first, and the exception is the
 * whole feature rather than a compromise in it. Everything else is written to
 * the phone and pushed afterwards, because capture must never wait on a
 * connection. A sealed letter cannot work that way: a body sitting in
 * AsyncStorage is readable by anyone holding the phone, and the seal would be
 * a thing the interface says rather than a thing that is true.
 *
 * So the body lives here only until the push succeeds, and then it is dropped.
 * After that the device holds the fact of the letter — when it was written,
 * when it opens — and has to ask the account for the contents on the day, which
 * is the only arrangement under which "sealed" means anything.
 *
 * Which leaves one honest gap: between writing a letter and the next successful
 * sync, the body is on the phone. There is nowhere else it could be. The screen
 * says so in those words rather than pretending otherwise.
 */

const KEY = 'letters.v1';

export interface Letter {
  id: string;
  /** 'YYYY-MM-DD' — the morning it opens. */
  unlockOn: string;
  createdAt: string;
  /**
   * Only ever present before the first successful push, or just after opening.
   *
   * Its absence is the normal state of a sealed letter on a device, and the
   * reason `sealed` below is a question about this field.
   */
  body?: string;
  /** Carries a body the account has not accepted yet. */
  unsynced?: boolean;
  /** When it was first read, as the account recorded it. */
  unlockedAt?: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToLetters(listener: Listener): () => void {
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
      logger.error('Letter listener failed', { error });
    }
  }
}

async function readAll(): Promise<Letter[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Letter[]) : [];
  } catch (error) {
    logger.error('Could not read letters', { error });
    return [];
  }
}

async function writeAll(letters: Letter[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(letters));
  notify();
}

/** Soonest to open first. */
export async function listLetters(): Promise<Letter[]> {
  return (await readAll()).sort((a, b) => a.unlockOn.localeCompare(b.unlockOn));
}

/**
 * Whether a letter is still waiting on this device as well as in the account.
 *
 * Not the same question as "is it sealed". A letter written five minutes ago on
 * a train has its body right here until the next sync, and saying otherwise on
 * the screen would be the one lie this feature cannot afford.
 */
export function stillOnThisPhone(letter: Letter): boolean {
  return letter.unsynced === true && letter.body !== undefined;
}

/** Whether its day has come. */
export function isOpenable(letter: Letter, today: string): boolean {
  return letter.unlockOn <= today;
}

export async function writeLetter(input: { body: string; unlockOn: string }): Promise<Letter> {
  const letter: Letter = {
    id: Crypto.randomUUID(),
    unlockOn: input.unlockOn,
    createdAt: new Date().toISOString(),
    body: input.body,
    unsynced: true,
  };

  await writeAll([letter, ...(await readAll())]);
  return letter;
}

/**
 * The letter reached the account, so the body leaves the phone.
 *
 * This is the moment the seal becomes real, and it is one line: dropping the
 * body. Everything else in this file is arrangement around making sure it
 * happens.
 */
export async function markSealed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const sealed = new Set(ids);
  const letters = await readAll();

  await writeAll(
    letters.map((letter) => {
      if (!sealed.has(letter.id)) return letter;
      const { body: _gone, ...without } = letter;
      return { ...without, unsynced: false };
    }),
  );
}

/** Keeps an opened letter's contents, so it can be read again without asking. */
export async function keepOpened(
  id: string,
  opened: { body: string | null; unlockedAt: string | null },
): Promise<void> {
  const letters = await readAll();
  const index = letters.findIndex((letter) => letter.id === id);
  if (index === -1) return;

  letters[index] = {
    ...(letters[index] as Letter),
    ...(opened.body !== null ? { body: opened.body } : {}),
    ...(opened.unlockedAt !== null ? { unlockedAt: opened.unlockedAt } : {}),
  };

  await writeAll(letters);
}

export async function forgetLetter(id: string): Promise<void> {
  await writeAll((await readAll()).filter((letter) => letter.id !== id));
}

export async function clearLetters(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

// ---------------------------------------------------------------------------
// For the sync engine
// ---------------------------------------------------------------------------

/** Letters whose body is still only on this phone. */
export async function unsentLetters(): Promise<Letter[]> {
  return (await readAll()).filter((letter) => stillOnThisPhone(letter));
}

/**
 * Takes the account's list of what is sealed.
 *
 * Metadata only — that is all `sealed_letters` returns, by design. A letter
 * written on another phone appears here as a fact with no contents, which is
 * exactly what it should look like from this one.
 *
 * Absence does not delete: an opened letter drops off the account's sealed list
 * the moment its day arrives, and treating that as "gone" would make every
 * letter vanish on the morning it was meant to be read.
 */
export async function applyRemoteLetters(
  incoming: { id: string; unlockOn: string; createdAt: string }[],
): Promise<void> {
  const known = new Set((await readAll()).map((letter) => letter.id));
  const additions = incoming
    .filter((letter) => !known.has(letter.id))
    .map((letter) => ({ ...letter, unsynced: false }));

  if (additions.length === 0) return;

  await writeAll([...(await readAll()), ...additions]);
}
