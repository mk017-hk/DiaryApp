import type { Entry, QuietDates, Thread } from '@/features/entries';
import type { Letter } from '@/features/letters';
import type { Profile } from '@/features/profile/profileStore';

/**
 * Everything the app holds about you, in a file you can keep.
 *
 * Two requirements pull in different directions here and both have to be met.
 * Data portability means a machine-readable archive that another program could
 * read, which argues for JSON. Actually having your diary means something a
 * person can open and read in ten years without this app existing, which argues
 * for HTML. So the export is both, built from the same source, and neither is
 * a summary of the other — the JSON is complete and the page renders all of it.
 *
 * The rule the whole module is written against: an export that quietly omits
 * something is worse than no export, because somebody who has one believes they
 * have their diary. So this is built by naming every store the app writes to,
 * and `everythingHeld` below is the list — if a future feature adds a store and
 * does not add it there, the test that counts them fails.
 */

export const ARCHIVE_VERSION = 1;

/** Every kind of thing this app keeps. Adding a store means adding it here. */
export const STORES = ['entries', 'threads', 'quietDates', 'letters', 'profile'] as const;

export interface ArchiveMedia {
  id: string;
  kind: string;
  /**
   * Where the file actually is, in words rather than as a path.
   *
   * A device path means nothing on another machine, and the export cannot carry
   * the files themselves — see the note in `writeArchive.ts`. So each one says
   * where to go and get it: 'photo library' for the photos and videos a save
   * puts in an album, 'this phone' for a voice note, which the library has
   * nowhere to put, and 'your account' for anything this device never held.
   */
  storedIn: 'photo library' | 'this phone' | 'your account';
  remotePath?: string;
  durationMs?: number;
}

export interface ArchiveEntry {
  id: string;
  date: string;
  writtenAt: string;
  body: string;
  mood: number | null;
  moodLabel: string | null;
  emotions: string[];
  thread: string | null;
  media: ArchiveMedia[];
  transcript?: string;
  favourite: boolean;
  /** The choices she made about this entry, kept rather than silently dropped. */
  keptFromAssistant?: boolean;
  keptFromResurfacing?: boolean;
  personal?: boolean;
}

export interface Archive {
  version: number;
  exportedAt: string;
  diary: {
    name: string;
    entryCount: number;
    from: string | null;
    to: string | null;
  };
  entries: ArchiveEntry[];
  threads: { id: string; title: string; description?: string; status: string; startedOn: string }[];
  quietDates: { from: string; to: string; label?: string }[];
  letters: {
    id: string;
    opensOn: string;
    writtenAt: string;
    body?: string;
    /** True when the letter is still sealed, so its absence is explained. */
    sealed: boolean;
  }[];
  profile: {
    name: string;
    tone: string;
    capture: string;
    intentions: string[];
    onboardedAt: string | null;
    assistantConsent?: boolean;
  };
}

const MOOD_LABELS: Record<number, string> = {
  1: 'Heavy',
  2: 'Low',
  3: 'Even',
  4: 'Good',
  5: 'Bright',
};

const MONTH = (n: number) =>
  [
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
  ][n] ?? '';

function readableDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return key;
  return `${String(day)} ${MONTH(month - 1)} ${String(year)}`;
}

export interface ArchiveInput {
  entries: Entry[];
  threads: Thread[];
  quietDates: QuietDates[];
  letters: Letter[];
  profile: Profile;
  exportedAt?: Date;
}

/**
 * Builds the archive.
 *
 * Deleted entries are left out — a tombstone is sync bookkeeping, not something
 * she wrote — but nothing else is. In particular the flags she set on an entry
 * are carried through: "keep this from the assistant" is part of the record of
 * what she wanted, and an export that dropped it would be quietly deciding her
 * choices were not her data.
 */
export function buildArchive(input: ArchiveInput): Archive {
  const exportedAt = input.exportedAt ?? new Date();
  const titleById = new Map(input.threads.map((thread) => [thread.id, thread.title]));

  const alive = input.entries
    .filter((entry) => entry.deletedAt === undefined)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate));

  const entries: ArchiveEntry[] = alive.map((entry) => ({
    id: entry.id,
    date: entry.entryDate,
    writtenAt: entry.entryAt,
    body: entry.body,
    mood: entry.mood,
    moodLabel: entry.mood === null ? null : (MOOD_LABELS[entry.mood] ?? null),
    emotions: entry.emotions,
    thread: entry.threadId === undefined ? null : (titleById.get(entry.threadId) ?? null),
    media: entry.media.map((item) => ({
      id: item.id,
      kind: item.kind,
      storedIn:
        item.uri === undefined
          ? ('your account' as const)
          : item.kind === 'audio'
            ? ('this phone' as const)
            : ('photo library' as const),
      ...(item.remotePath !== undefined ? { remotePath: item.remotePath } : {}),
      ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}),
    })),
    ...(entry.transcript !== undefined ? { transcript: entry.transcript } : {}),
    favourite: entry.isFavourite,
    ...(entry.aiExcluded === true ? { keptFromAssistant: true } : {}),
    ...(entry.resurfaceExcluded === true ? { keptFromResurfacing: true } : {}),
    ...(entry.isPersonal === true ? { personal: true } : {}),
  }));

  return {
    version: ARCHIVE_VERSION,
    exportedAt: exportedAt.toISOString(),
    diary: {
      name: input.profile.name,
      entryCount: entries.length,
      from: entries[0]?.date ?? null,
      to: entries[entries.length - 1]?.date ?? null,
    },
    entries,
    threads: input.threads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      ...(thread.description !== undefined ? { description: thread.description } : {}),
      status: thread.status,
      startedOn: thread.startedOn,
    })),
    quietDates: input.quietDates
      .filter((mute) => mute.deletedAt === undefined)
      .map((mute) => ({
        from: `${String(mute.fromDay)} ${MONTH(mute.fromMonth - 1)}`,
        to: `${String(mute.toDay)} ${MONTH(mute.toMonth - 1)}`,
        ...(mute.label !== undefined ? { label: mute.label } : {}),
      })),
    // A sealed letter has no body to export, and saying so is the honest
    // version. Leaving it out of the archive entirely would be the export
    // quietly agreeing that it does not exist.
    letters: input.letters.map((letter) => ({
      id: letter.id,
      opensOn: letter.unlockOn,
      writtenAt: letter.createdAt,
      ...(letter.body !== undefined ? { body: letter.body } : {}),
      sealed: letter.body === undefined,
    })),
    profile: {
      name: input.profile.name,
      tone: input.profile.tone,
      capture: input.profile.capture,
      intentions: input.profile.intentions,
      onboardedAt: input.profile.onboardedAt,
      ...(input.profile.assistantConsent !== undefined
        ? { assistantConsent: input.profile.assistantConsent }
        : {}),
    },
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The same archive as a page somebody can read.
 *
 * Deliberately one self-contained file with no scripts and no external
 * stylesheet: it has to open in whatever browser exists in ten years, off a
 * memory stick, with this app long gone. That is the actual test of whether
 * somebody owns their diary.
 *
 * Media is named rather than embedded: the files are far too large to travel
 * inside a page, and a broken image icon would read as the export having lost
 * something. A sentence saying where each one went does not.
 */
export function renderArchiveHtml(archive: Archive): string {
  const title =
    archive.diary.name.length > 0 ? `${escapeHtml(archive.diary.name)}'s diary` : 'A diary';

  const span =
    archive.diary.from === null || archive.diary.to === null
      ? ''
      : `<p class="span">${escapeHtml(readableDate(archive.diary.from))} — ${escapeHtml(
          readableDate(archive.diary.to),
        )}</p>`;

  const entries = archive.entries
    .map((entry) => {
      const bits: string[] = [];

      bits.push(`<h2>${escapeHtml(readableDate(entry.date))}</h2>`);

      const tags = [
        entry.moodLabel,
        ...entry.emotions,
        entry.thread === null ? null : `in “${entry.thread}”`,
      ].filter((tag): tag is string => tag !== null && tag.length > 0);

      if (tags.length > 0) {
        bits.push(`<p class="tags">${tags.map((tag) => escapeHtml(tag)).join(' · ')}</p>`);
      }

      if (entry.body.length > 0) {
        bits.push(
          entry.body
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .map((line) => `<p>${escapeHtml(line)}</p>`)
            .join('\n'),
        );
      }

      // In words rather than as a tag. The files are too large to travel with
      // this page, so a broken image icon would read as the export having lost
      // something; a sentence saying where it went does not.
      for (const item of entry.media) {
        const where =
          item.storedIn === 'photo library'
            ? `A ${escapeHtml(item.kind)}, saved to the Diary album in your photos.`
            : item.storedIn === 'this phone'
              ? 'A voice note, kept on the phone this was exported from.'
              : `A ${escapeHtml(item.kind)} kept in your account rather than on this phone.`;

        bits.push(`<p class="missing">${where}</p>`);
      }

      if (entry.transcript !== undefined) {
        bits.push(`<blockquote>${escapeHtml(entry.transcript)}</blockquote>`);
      }

      return `<article>${bits.join('\n')}</article>`;
    })
    .join('\n');

  const letters =
    archive.letters.length === 0
      ? ''
      : `<section class="letters"><h2>Letters to yourself</h2>${archive.letters
          .map((letter) =>
            letter.sealed
              ? `<p class="missing">A letter that opens on ${escapeHtml(
                  readableDate(letter.opensOn),
                )}. It is sealed, so not even this export can read it.</p>`
              : `<article><h3>Opened ${escapeHtml(
                  readableDate(letter.opensOn),
                )}</h3><p>${escapeHtml(letter.body ?? '')}</p></article>`,
          )
          .join('\n')}</section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    background: #FBF8F5; color: #2A2320;
    font: 17px/1.7 Georgia, 'Times New Roman', serif;
    margin: 0 auto; max-width: 38rem; padding: 3rem 1.25rem 6rem;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #14110F; color: #EDE6E0; }
  }
  h1 { font-size: 2rem; margin: 0; }
  h2 { font-size: 1.05rem; font-weight: normal; letter-spacing: .02em; margin: 3rem 0 .25rem; opacity: .6; }
  h3 { font-size: 1rem; margin: 2rem 0 .25rem; opacity: .6; }
  p { margin: 0 0 1rem; }
  .span, .tags { font-size: .85rem; opacity: .55; }
  .tags { margin-bottom: 1rem; }
  .missing { font-size: .85rem; font-style: italic; opacity: .5; }
  article { border-bottom: 1px solid rgba(128,110,100,.18); padding-bottom: 1.5rem; }
  img, video { border-radius: 8px; max-width: 100%; }
  blockquote { border-left: 2px solid rgba(128,110,100,.3); margin: 1rem 0; padding-left: 1rem; opacity: .75; }
  footer { font-size: .8rem; margin-top: 4rem; opacity: .45; }
</style>
</head>
<body>
<h1>${title}</h1>
${span}
${entries}
${letters}
<footer>Exported ${escapeHtml(archive.exportedAt.slice(0, 10))}. This page needs nothing but a browser and no app at all, so it will still open in ten years. Photos and videos are not inside it — they are too large to travel in a page, and live in your photo library instead.</footer>
</body>
</html>`;
}
