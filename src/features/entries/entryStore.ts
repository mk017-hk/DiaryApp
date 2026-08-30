import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { toDateKey } from '@/lib/date';
import { logger } from '@/services/logger';

/**
 * Entries, stored on the device.
 *
 * A deliberate stand-in for the Supabase repository, wearing the same shape as
 * the `journal_entries` table so Phase 4 replaces the body of these functions
 * and nothing that calls them changes. It also means capture works offline
 * from the very first version, which is the behaviour we want permanently —
 * an entry should never be lost to a dropped connection.
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
  /** What was said, once transcription exists. Separate from the note. */
  transcript?: string;
  isFavourite: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NewEntry = Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>;

async function readAll(): Promise<Entry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Entry[]) : [];
  } catch (error) {
    logger.error('Could not read entries', { error });
    return [];
  }
}

async function writeAll(entries: Entry[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(entries));
}

export async function listEntries(): Promise<Entry[]> {
  const entries = await readAll();
  return entries.sort((a, b) => b.entryAt.localeCompare(a.entryAt));
}

export async function entriesForDate(dateKey: string): Promise<Entry[]> {
  return (await listEntries()).filter((entry) => entry.entryDate === dateKey);
}

/** Which days have something written on them — drives the calendar dots. */
export async function datesWithEntries(): Promise<Set<string>> {
  return new Set((await readAll()).map((entry) => entry.entryDate));
}

export async function getEntry(id: string): Promise<Entry | null> {
  return (await readAll()).find((entry) => entry.id === id) ?? null;
}

export async function createEntry(input: NewEntry): Promise<Entry> {
  const now = new Date().toISOString();
  const entry: Entry = {
    ...input,
    id: Crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  const entries = await readAll();
  await writeAll([entry, ...entries]);
  return entry;
}

export async function updateEntry(id: string, patch: Partial<NewEntry>): Promise<Entry | null> {
  const entries = await readAll();
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return null;

  const existing = entries[index]!;
  const updated: Entry = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  entries[index] = updated;
  await writeAll(entries);
  return updated;
}

export async function deleteEntry(id: string): Promise<void> {
  const entries = await readAll();
  await writeAll(entries.filter((entry) => entry.id !== id));
}

/** Entries from this day in previous years. */
export async function onThisDay(today: Date = new Date()): Promise<Entry[]> {
  const month = today.getMonth();
  const day = today.getDate();
  const todayKey = toDateKey(today);

  return (await listEntries()).filter((entry) => {
    if (entry.entryDate === todayKey) return false;
    const [, m, d] = entry.entryDate.split('-').map(Number);
    return (m ?? 0) - 1 === month && d === day;
  });
}
