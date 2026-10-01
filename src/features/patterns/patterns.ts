import type { Entry } from '@/features/entries';
import { toDateKey } from '@/lib/date';

/**
 * What a stretch of diary looks like from a distance.
 *
 * Pure functions over entries the device already holds. The roadmap called for
 * aggregating this in an RPC, on the grounds that pulling a year of entries to
 * the client to draw a chart defeats the storage model — but that reasoning
 * belongs to a product where the server is the authority for reads, and this
 * one is the other way round. The entries are already here. A round trip would
 * buy nothing and cost the one thing this screen should never need, which is a
 * connection.
 *
 * Everything here describes. Nothing here concludes. There is no average mood,
 * no score, no label for a month, because a number summarising how somebody has
 * been is a judgement wearing arithmetic, and the copy rules this app is built
 * on rule it out: name what she wrote, never what it means about her.
 *
 * And nothing counts days. No streak, no "you have written 12 times this
 * month", no mention of a gap. A diary that keeps score is a diary you can
 * fail at, and somebody who stopped writing for three weeks in February almost
 * certainly had a reason.
 */

/** One entry that carried a mood, placed on the line. */
export interface MoodPoint {
  entryId: string;
  /** 'YYYY-MM-DD'. */
  date: string;
  /** 1-5, as the compose screen offers it. */
  mood: number;
}

/** A word she chose, and how often. Content, not cadence. */
export interface EmotionTally {
  slug: string;
  count: number;
}

export interface Patterns {
  /** Oldest first, so it reads left to right. */
  moods: MoodPoint[];
  /** Most used first. */
  emotions: EmotionTally[];
  /** Every day in the window that holds anything, for the texture strip. */
  daysWritten: Set<string>;
  /** The window actually covered, or null when nothing falls inside it. */
  span: { from: string; to: string } | null;
}

export const WINDOWS = [
  { days: 30, label: 'A month' },
  { days: 90, label: 'Three months' },
  { days: 365, label: 'A year' },
] as const;

/** The mood words the compose screen uses, so the axis speaks the same language. */
export const MOOD_LABELS: Record<number, string> = {
  1: 'Heavy',
  2: 'Low',
  3: 'Even',
  4: 'Good',
  5: 'Bright',
};

/**
 * The first day of the window.
 *
 * Inclusive of both ends, counted in whole days so a window never slices a day
 * in half depending on what time somebody opened the screen.
 */
export function windowStart(today: Date, days: number): string {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
  return toDateKey(start);
}

/**
 * Everything the screen draws, from entries the device already has.
 *
 * `threadId` narrows to one story. Entries without a mood still count towards
 * the texture and their emotions still count — leaving a mood unanswered is a
 * perfectly ordinary thing to do and should not remove the day from the record.
 */
export function summarise(
  entries: Entry[],
  options: { today?: Date; days: number; threadId?: string },
): Patterns {
  const today = options.today ?? new Date();
  const from = windowStart(today, options.days);
  const to = toDateKey(today);

  const inWindow = entries
    .filter((entry) => entry.entryDate >= from && entry.entryDate <= to)
    .filter((entry) => options.threadId === undefined || entry.threadId === options.threadId);

  const moods: MoodPoint[] = inWindow
    .filter((entry): entry is Entry & { mood: number } => entry.mood !== null)
    .map((entry) => ({ entryId: entry.id, date: entry.entryDate, mood: entry.mood }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const counts = new Map<string, number>();
  for (const entry of inWindow) {
    for (const slug of entry.emotions) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  const emotions = [...counts.entries()]
    .map(([slug, count]) => ({ slug, count }))
    // Ties broken by name rather than by insertion order, so the list does not
    // reshuffle itself between two renders of identical data.
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));

  const daysWritten = new Set(inWindow.map((entry) => entry.entryDate));

  const dates = [...daysWritten].sort();
  const first = dates[0];
  const last = dates[dates.length - 1];

  return {
    moods,
    emotions,
    daysWritten,
    span: first === undefined || last === undefined ? null : { from: first, to: last },
  };
}

/**
 * The days of the window, oldest first, each marked or not.
 *
 * The texture strip: one mark per day, no numbers, no run lengths. A month
 * where somebody wrote twice should look like a quiet month, not like a failure
 * — the same decision the calendar already makes by using a small dot instead
 * of shading the whole cell.
 */
export function texture(
  daysWritten: Set<string>,
  options: { today?: Date; days: number },
): { date: string; written: boolean }[] {
  const today = options.today ?? new Date();
  const strip: { date: string; written: boolean }[] = [];

  for (let offset = options.days - 1; offset >= 0; offset -= 1) {
    const date = toDateKey(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset),
    );
    strip.push({ date, written: daysWritten.has(date) });
  }

  return strip;
}
