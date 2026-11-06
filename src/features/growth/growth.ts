import type { DayLog } from '@/features/cycle';
import type { Entry } from '@/features/entries';

/**
 * What a diary keeps coming back to.
 *
 * Worked out on the phone from what she wrote, with nothing sent anywhere.
 * The same rule as every other screen that looks at the diary from a distance:
 * this names what is there and stops. It does not decide who is important, sort
 * people into good and bad, or say that a word means anything.
 *
 * People and places are not told apart. A capitalised word somebody keeps
 * writing is a name, and guessing whether "Ellie" is a friend or a town would
 * be a guess presented as a fact. So the section is "names you mention", and
 * she knows which is which.
 */

export interface Count {
  word: string;
  count: number;
}

const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being
  below between both but by can could did do does doing down during each even ever every few for from
  further get gets getting got had has have having he her here hers herself him himself his how i if
  in into is it its itself just know like made make many me more most much must my myself never no nor
  not now of off on once one only or other our ours ourselves out over own really said same say see
  she should so some still such than that the their theirs them themselves then there these they thing
  things think this those though through to too under until up upon us very was way we well went were
  what when where which while who whom why will with would yet you your yours yourself yourselves
  today yesterday tomorrow day days time week weeks month year years night morning evening feel felt
  feeling going want wanted need needed back again maybe something anything nothing everything lot
  bit little kind sort quite pretty around another always often sometimes keep kept come came done
  doing first last next good bad long right left little big new old next better best didn don doesn
  isn wasn couldn wouldn shouldn can't won't i'm it's that's i've i'll i'd let let's`
    .split(/\s+/)
    .filter((word) => word.length > 0),
);

/** Capitalised for reasons that have nothing to do with being a name. */
const NOT_NAMES = new Set([
  'I',
  'I’m',
  "I'm",
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'OK',
  'Ok',
  'TV',
]);

const words = (text: string): string[] =>
  text
    .split(/[^\p{L}’']+/u)
    .map((word) => word.replace(/^['’]+|['’]+$/g, ''))
    .filter((word) => word.length > 0);

function ranked(map: Map<string, number>, limit: number, minimum: number): Count[] {
  return [...map.entries()]
    .filter(([, count]) => count >= minimum)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

/**
 * Words that recur, across entries rather than within one.
 *
 * Counted once per entry, so a single long entry that says "work" twenty times
 * does not outrank a word that turns up in a dozen different days.
 */
export function recurringWords(entries: Entry[], limit = 12): Count[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const seen = new Set<string>();
    for (const raw of words(entry.body)) {
      const word = raw.toLowerCase();
      if (word.length < 4 || STOPWORDS.has(word) || seen.has(word)) continue;
      seen.add(word);
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return ranked(counts, limit, 2);
}

/**
 * Names: capitalised words that are not at the start of a sentence.
 *
 * A word she also writes in lower case somewhere is left out — "Work" at the
 * start of a line is not a name if "work" appears elsewhere. Counted once per
 * entry, and only those in two entries or more.
 */
export function namesMentioned(entries: Entry[], limit = 12): Count[] {
  const lower = new Set<string>();
  for (const entry of entries) {
    for (const word of words(entry.body)) if (word === word.toLowerCase()) lower.add(word);
  }

  const counts = new Map<string, number>();
  for (const entry of entries) {
    const seen = new Set<string>();
    for (const sentence of entry.body.split(/[.!?\n]+/)) {
      const inSentence = words(sentence);
      inSentence.forEach((word, index) => {
        if (index === 0) return;
        if (!/^\p{Lu}\p{Ll}+$/u.test(word)) return;
        if (NOT_NAMES.has(word) || lower.has(word.toLowerCase()) || seen.has(word)) return;
        seen.add(word);
        counts.set(word, (counts.get(word) ?? 0) + 1);
      });
    }
  }
  return ranked(counts, limit, 2);
}

export interface MonthFeelings {
  /** 'YYYY-MM'. */
  month: string;
  /** Emotion slugs, most used first. */
  top: Count[];
}

/** The feelings named most in each month, from entries and logs together. */
export function feelingsByMonth(entries: Entry[], logs: DayLog[], perMonth = 3): MonthFeelings[] {
  const months = new Map<string, Map<string, number>>();
  const add = (date: string, slugs: string[]) => {
    const month = date.slice(0, 7);
    const counts = months.get(month) ?? new Map<string, number>();
    for (const slug of slugs) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    months.set(month, counts);
  };
  for (const entry of entries) add(entry.entryDate, entry.emotions);
  for (const log of logs) add(log.date, log.moods);

  return [...months.entries()]
    .map(([month, counts]) => ({ month, top: ranked(counts, perMonth, 1) }))
    .filter((month) => month.top.length > 0)
    .sort((a, b) => b.month.localeCompare(a.month));
}
