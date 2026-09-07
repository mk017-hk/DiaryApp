import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { logger } from '@/services/logger';

/**
 * Threads: the stories an entry can belong to.
 *
 * "Trying again", "the move", "the first year". A diary without them is a pile
 * of days; with them it is a set of arcs you can follow, which is the whole
 * difference between an app that reacts to yesterday and one that knows what
 * you have been living through.
 *
 * Stored the same way entries are — locally first, pushed after — because
 * starting a thread must work in the same places writing an entry does.
 *
 * Threads are **closed, not deleted**. There is no tombstone here and none is
 * needed: a story that ended is still part of the record, and the schema's
 * `status` says so.
 */

const KEY = 'threads.v1';

export type ThreadStatus = 'open' | 'closed';

export interface Thread {
  id: string;
  title: string;
  description?: string;
  status: ThreadStatus;
  /**
   * Excluded from the assistant entirely.
   *
   * Enforced server-side when context is assembled, never here — a client
   * flag would be a promise the client cannot keep. This is the copy of it
   * the picker shows.
   */
  isPrivate: boolean;
  /** 'YYYY-MM-DD' — when the story starts, which may predate the diary. */
  startedOn: string;
  createdAt: string;
  updatedAt: string;
  unsynced?: boolean;
}

export type NewThread = Pick<Thread, 'title' | 'isPrivate' | 'startedOn'> &
  Partial<Pick<Thread, 'description'>>;

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToThreads(listener: Listener): () => void {
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
      logger.error('Thread listener failed', { error });
    }
  }
}

async function readAll(): Promise<Thread[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return (parsed as Thread[]).map((thread) => ({ ...thread, unsynced: thread.unsynced ?? true }));
  } catch (error) {
    logger.error('Could not read threads', { error });
    return [];
  }
}

async function writeAll(threads: Thread[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(threads));
  notify();
}

/** Open first, then by when the story started. */
export async function listThreads(): Promise<Thread[]> {
  const threads = await readAll();
  return threads.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.startedOn.localeCompare(a.startedOn);
  });
}

export async function openThreads(): Promise<Thread[]> {
  return (await listThreads()).filter((thread) => thread.status === 'open');
}

export async function getThread(id: string): Promise<Thread | null> {
  return (await readAll()).find((thread) => thread.id === id) ?? null;
}

export async function createThread(input: NewThread): Promise<Thread> {
  const now = new Date().toISOString();
  const thread: Thread = {
    ...input,
    id: Crypto.randomUUID(),
    status: 'open',
    createdAt: now,
    updatedAt: now,
    unsynced: true,
  };

  await writeAll([thread, ...(await readAll())]);
  return thread;
}

export async function updateThread(
  id: string,
  patch: Partial<Omit<Thread, 'id' | 'createdAt' | 'updatedAt' | 'unsynced'>>,
): Promise<Thread | null> {
  const threads = await readAll();
  const index = threads.findIndex((thread) => thread.id === id);
  if (index === -1) return null;

  const updated: Thread = {
    ...threads[index]!,
    ...patch,
    updatedAt: new Date().toISOString(),
    unsynced: true,
  };

  threads[index] = updated;
  await writeAll(threads);
  return updated;
}

export async function clearThreads(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

// ---------------------------------------------------------------------------
// For the sync engine
// ---------------------------------------------------------------------------

export async function unsyncedThreads(): Promise<Thread[]> {
  return (await readAll()).filter((thread) => thread.unsynced === true);
}

/**
 * Writes threads that came from the server.
 *
 * The same rule as entries: an older row never overwrites a newer one, on
 * `updatedAt` alone. Threads are edited rarely, so this almost never fires —
 * but "almost never" is exactly when a rule nobody wrote gets discovered.
 */
export async function applyRemoteThreads(incoming: Thread[]): Promise<void> {
  if (incoming.length === 0) return;

  const byId = new Map((await readAll()).map((thread) => [thread.id, thread]));

  for (const remote of incoming) {
    const local = byId.get(remote.id);
    if (local !== undefined && local.updatedAt > remote.updatedAt) continue;
    byId.set(remote.id, { ...remote, unsynced: false });
  }

  await writeAll([...byId.values()]);
}

export async function markThreadsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const accepted = new Set(ids);
  const threads = await readAll();
  await writeAll(
    threads.map((thread) => (accepted.has(thread.id) ? { ...thread, unsynced: false } : thread)),
  );
}
