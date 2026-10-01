import type { Entry, Thread } from '@/features/entries';

/**
 * Finding something you wrote.
 *
 * The app calls itself an archive, and an archive you cannot search is a pile
 * of days with better typography. This is the part that makes "what did I say
 * about my sister last spring" a question with an answer.
 *
 * On the device, over entries it already holds. That is not a shortcut around
 * doing it properly server-side — it is better: instant, works with no signal,
 * and the one thing it never does is send what somebody is looking for in their
 * own diary to a server. A search term can be more revealing than the entry it
 * finds.
 *
 * Deliberately simple matching rather than a stemmer or an index. A diary is
 * thousands of entries, not millions of documents, and the failure mode of
 * clever matching — "sat" finding "sitting" but not "sat down" — is worse here
 * than a search that does exactly what it looks like it does.
 */

export interface Match {
  entry: Entry;
  /** A line of context around the first hit, for the result row. */
  snippet: string;
  /** Where in `snippet` the hit falls, so a screen can mark it. */
  highlight: { start: number; end: number } | null;
  /** Why it matched, when it was not the body. */
  matchedOn: 'body' | 'transcript' | 'feeling' | 'story';
}

/**
 * Folds case and accents.
 *
 * Someone searching for "cafe" should find "café", and someone who wrote
 * "Mum" should find it having typed "mum". Both are the same request: match
 * what I meant, not what I typed.
 */
export function normalise(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Splits a query into the words that all have to appear. */
export function terms(query: string): string[] {
  return normalise(query)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 120;

/**
 * A readable piece of the entry around the first hit.
 *
 * Trimmed at word boundaries, because a snippet that starts mid-word reads as
 * a glitch rather than as an excerpt.
 */
function snippetAround(text: string, at: number, length: number): Match {
  const rawStart = Math.max(0, at - SNIPPET_BEFORE);
  const rawEnd = Math.min(text.length, at + length + SNIPPET_AFTER);

  let start = rawStart;
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space !== -1 && space < at) start = space + 1;
  }

  let end = rawEnd;
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space !== -1 && space > at + length) end = space;
  }

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';

  return {
    entry: undefined as never,
    snippet: `${prefix}${text.slice(start, end)}${suffix}`,
    highlight: { start: at - start + prefix.length, end: at - start + prefix.length + length },
    matchedOn: 'body',
  };
}

/**
 * Entries matching every word of the query, most recent first.
 *
 * Every word rather than any: typing a second word is somebody narrowing down,
 * and a search that widened instead would be answering the opposite question.
 */
export function search(entries: Entry[], threads: Thread[], query: string): Match[] {
  const wanted = terms(query);
  if (wanted.length === 0) return [];

  const titleById = new Map(threads.map((thread) => [thread.id, thread.title]));
  const matches: Match[] = [];

  for (const entry of entries) {
    if (entry.deletedAt !== undefined) continue;

    const title = entry.threadId === undefined ? '' : (titleById.get(entry.threadId) ?? '');
    const haystacks = {
      body: entry.body,
      transcript: entry.transcript ?? '',
      feeling: entry.emotions.join(' '),
      story: title,
    } as const;

    const normalised = {
      body: normalise(haystacks.body),
      transcript: normalise(haystacks.transcript),
      feeling: normalise(haystacks.feeling),
      story: normalise(haystacks.story),
    };

    // Every word has to appear somewhere in the entry, though not all in the
    // same place: "sister birthday" should find an entry about a sister filed
    // under a thread called "birthdays".
    const everyTermFound = wanted.every((term) =>
      Object.values(normalised).some((field) => field.includes(term)),
    );

    if (!everyTermFound) continue;

    // The snippet comes from wherever the first word actually landed, in the
    // order most worth showing: what she wrote, then what she said, then the
    // labels around it.
    const first = wanted[0] as string;
    const order = ['body', 'transcript', 'feeling', 'story'] as const;
    let built: Match | null = null;

    for (const field of order) {
      const at = normalised[field].indexOf(first);
      if (at === -1) continue;

      const base = snippetAround(haystacks[field], at, first.length);
      built = { ...base, entry, matchedOn: field };
      break;
    }

    matches.push(
      built ?? { entry, snippet: entry.body.slice(0, 160), highlight: null, matchedOn: 'body' },
    );
  }

  return matches.sort((a, b) => b.entry.entryDate.localeCompare(a.entry.entryDate));
}
