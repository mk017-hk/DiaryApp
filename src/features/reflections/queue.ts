import AsyncStorage from '@react-native-async-storage/async-storage';

import { canTranscribe, type Entry } from '@/features/entries/entryStore';

/**
 * Entries waiting for the assistant's notes.
 *
 * An entry joins when it is saved or edited, and leaves once it has notes or
 * has been told it will not get any. In between it waits for two things, in
 * order: for its recordings to be transcribed on this phone, so the notes are
 * about what she said and not only what she typed; and for it to reach the
 * account, because the function reads it from there, as her.
 */

const KEY = 'reflections.pending.v1';
const SETTINGS_KEY = 'reflections.v1';

/** Tries per entry before giving up on a transient failure. */
export const MAX_ATTEMPTS = 3;

export interface Pending {
  entryId: string;
  attempts: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToReflections(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tells screens a reflection appeared or went, so they can reload. */
export function notifyReflections(): void {
  for (const listener of [...listeners]) listener();
}

async function read(): Promise<Pending[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw === null ? [] : (JSON.parse(raw) as unknown);
    return Array.isArray(parsed) ? (parsed as Pending[]) : [];
  } catch {
    return [];
  }
}

async function write(items: Pending[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
  notifyReflections();
}

export async function pendingReflections(): Promise<Pending[]> {
  return read();
}

export async function queueReflection(entryId: string): Promise<void> {
  const items = await read();
  if (items.some((item) => item.entryId === entryId)) {
    // Edited again while waiting: start its attempts afresh.
    await write(items.map((item) => (item.entryId === entryId ? { entryId, attempts: 0 } : item)));
    return;
  }
  await write([...items, { entryId, attempts: 0 }]);
}

export async function finishReflection(entryId: string): Promise<void> {
  await write((await read()).filter((item) => item.entryId !== entryId));
}

/** Counts a failed try; drops the entry once it has had its last one. */
export async function retryLater(entryId: string): Promise<void> {
  const items = await read();
  await write(
    items
      .map((item) => (item.entryId === entryId ? { ...item, attempts: item.attempts + 1 } : item))
      .filter((item) => item.attempts < MAX_ATTEMPTS),
  );
}

export async function clearReflectionQueue(): Promise<void> {
  await AsyncStorage.multiRemove([KEY, SETTINGS_KEY]);
  notifyReflections();
}

/** Whether new entries get notes without being asked. On by default. */
export async function autoReflect(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw === null ? true : (JSON.parse(raw) as { auto?: boolean }).auto !== false;
  } catch {
    return true;
  }
}

export async function setAutoReflect(auto: boolean): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ auto }));
  notifyReflections();
}

export type Readiness = 'ready' | 'waiting' | 'gone' | 'never';

/**
 * Whether an entry can be sent for notes yet.
 *
 * `never` is an entry the assistant may not read — held back, or kept just for
 * her — which the function would refuse anyway; asking would only spend a
 * request to be told no. `transcribing` decides whether to wait for words from
 * its recordings: on a build that cannot transcribe, there are none coming.
 */
export function readiness(entry: Entry | null, transcribing: boolean): Readiness {
  if (entry === null || entry.deletedAt !== undefined) return 'gone';
  if (entry.aiExcluded === true || entry.isPersonal === true) return 'never';

  const recordings = entry.media.filter(canTranscribe);
  if (transcribing) {
    const stillListening = recordings.some(
      (item) =>
        item.uri !== undefined &&
        (item.transcriptStatus === undefined || item.transcriptStatus === 'pending'),
    );
    if (stillListening) return 'waiting';
  }

  // The words have to be in the account before the function can read them.
  if (entry.unsynced !== false) return 'waiting';
  const transcriptUnsent = recordings.some(
    (item) => item.transcriptStatus === 'done' && item.transcriptSynced === false,
  );
  if (transcriptUnsent) return 'waiting';

  return 'ready';
}

/**
 * The assistant read something that described someone in danger.
 *
 * Held in memory only, and only until it has been seen: Today shows people to
 * talk to while it is set. Never written down, and never sent anywhere.
 */
let supportShown = false;

export function needsSupport(): boolean {
  return supportShown;
}

export function markSupportNeeded(): void {
  supportShown = true;
  notifyReflections();
}

export function dismissSupport(): void {
  supportShown = false;
  notifyReflections();
}
