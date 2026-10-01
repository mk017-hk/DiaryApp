import type { Entry, Thread } from '@/features/entries';

import { normalise, search, terms } from '../search';

/**
 * Finding something you wrote.
 *
 * Most of these are about the cases that make a search feel broken rather than
 * the case that makes it work: accents, capitals, a second word, a match that
 * lands in a transcript rather than in the body.
 */

const entry = (overrides: Partial<Entry> & { id: string; entryDate: string }): Entry => ({
  entryAt: `${overrides.entryDate}T09:00:00.000Z`,
  body: '',
  mood: null,
  emotions: [],
  media: [],
  isFavourite: false,
  createdAt: `${overrides.entryDate}T09:00:00.000Z`,
  updatedAt: `${overrides.entryDate}T09:00:00.000Z`,
  ...overrides,
});

const thread: Thread = {
  id: 't-1',
  title: 'The first year',
  status: 'open',
  isPrivate: false,
  startedOn: '2026-01-01',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const ids = (matches: { entry: Entry }[]) => matches.map((match) => match.entry.id);

describe('matching', () => {
  const entries = [
    entry({ id: 'a', entryDate: '2026-05-01', body: 'Lunch with my sister.' }),
    entry({ id: 'b', entryDate: '2026-05-02', body: 'A quiet day in the garden.' }),
  ];

  it('finds a word in the body', () => {
    expect(ids(search(entries, [], 'sister'))).toEqual(['a']);
  });

  it('ignores capitals', () => {
    expect(ids(search(entries, [], 'SISTER'))).toEqual(['a']);
  });

  it('finds part of a word, which is what a diary search is for', () => {
    expect(ids(search(entries, [], 'gard'))).toEqual(['b']);
  });

  it('returns nothing for a word nobody wrote', () => {
    expect(search(entries, [], 'helicopter')).toEqual([]);
  });

  it('returns nothing for an empty query rather than everything', () => {
    expect(search(entries, [], '')).toEqual([]);
    expect(search(entries, [], '   ')).toEqual([]);
  });

  it('skips a deleted entry', () => {
    const deleted = [
      entry({
        id: 'gone',
        entryDate: '2026-05-01',
        body: 'Lunch with my sister.',
        deletedAt: '2026-05-02T00:00:00.000Z',
      }),
    ];

    expect(search(deleted, [], 'sister')).toEqual([]);
  });

  it('puts the most recent first', () => {
    const many = [
      entry({ id: 'old', entryDate: '2026-01-01', body: 'sister' }),
      entry({ id: 'new', entryDate: '2026-09-01', body: 'sister' }),
    ];

    expect(ids(search(many, [], 'sister'))).toEqual(['new', 'old']);
  });
});

describe('two words', () => {
  const entries = [
    entry({ id: 'both', entryDate: '2026-05-01', body: 'My sister had a birthday.' }),
    entry({ id: 'one', entryDate: '2026-05-02', body: 'My sister called.' }),
  ];

  // Typing a second word is somebody narrowing down. A search that widened
  // would be answering the opposite question.
  it('requires every word, not any of them', () => {
    expect(ids(search(entries, [], 'sister birthday'))).toEqual(['both']);
  });

  // Not necessarily in the same field, though: "sister birthday" should find an
  // entry about a sister filed under a thread called birthdays.
  it('lets the words land in different places', () => {
    const filed = [
      entry({
        id: 'a',
        entryDate: '2026-05-01',
        body: 'A long lunch with my sister.',
        threadId: 't-1',
      }),
    ];

    expect(ids(search(filed, [{ ...thread, title: 'Birthdays' }], 'sister birthday'))).toEqual([
      'a',
    ]);
  });

  it('ignores extra spaces between words', () => {
    expect(ids(search(entries, [], '  sister   birthday '))).toEqual(['both']);
  });
});

describe('accents', () => {
  // Somebody searching for "cafe" should find "café". Both are the same
  // request: match what I meant, not what I typed.
  it('folds them both ways', () => {
    const entries = [entry({ id: 'a', entryDate: '2026-05-01', body: 'We sat in the café.' })];

    expect(ids(search(entries, [], 'cafe'))).toEqual(['a']);
    expect(ids(search(entries, [], 'café'))).toEqual(['a']);
  });

  it('normalises to the same string either way', () => {
    expect(normalise('Café')).toEqual(normalise('cafe'));
  });
});

describe('where else it looks', () => {
  it('finds a word in the transcript of what was said', () => {
    const entries = [
      entry({
        id: 'a',
        entryDate: '2026-05-01',
        body: '',
        transcript: 'I said out loud that I was frightened.',
      }),
    ];

    const found = search(entries, [], 'frightened');

    expect(ids(found)).toEqual(['a']);
    expect(found[0]?.matchedOn).toEqual('transcript');
  });

  it('finds an entry by a feeling she picked', () => {
    const entries = [entry({ id: 'a', entryDate: '2026-05-01', emotions: ['lonely'] })];

    const found = search(entries, [], 'lonely');

    expect(ids(found)).toEqual(['a']);
    expect(found[0]?.matchedOn).toEqual('feeling');
  });

  it('finds an entry by the story it belongs to', () => {
    const entries = [entry({ id: 'a', entryDate: '2026-05-01', threadId: 't-1' })];

    const found = search(entries, [thread], 'first year');

    expect(ids(found)).toEqual(['a']);
    expect(found[0]?.matchedOn).toEqual('story');
  });

  // The body is what she wrote; everything else is a label around it.
  it('prefers the body when a word is in several places', () => {
    const entries = [
      entry({
        id: 'a',
        entryDate: '2026-05-01',
        body: 'A lonely sort of week.',
        emotions: ['lonely'],
      }),
    ];

    expect(search(entries, [], 'lonely')[0]?.matchedOn).toEqual('body');
  });
});

describe('the snippet', () => {
  const long =
    'It had been raining since Tuesday and I had not left the house, which is the kind of thing ' +
    'I only notice afterwards, and then on Thursday my sister turned up at the door with soup ' +
    'and stayed until it got dark and neither of us said very much about any of it.';

  it('shows the words around the hit, not the start of the entry', () => {
    const found = search([entry({ id: 'a', entryDate: '2026-05-01', body: long })], [], 'sister');

    expect(found[0]?.snippet).toContain('sister');
    expect(found[0]?.snippet).not.toContain('It had been raining');
  });

  it('marks where the hit falls', () => {
    const found = search([entry({ id: 'a', entryDate: '2026-05-01', body: long })], [], 'sister');
    const { snippet, highlight } = found[0] as {
      snippet: string;
      highlight: { start: number; end: number };
    };

    expect(snippet.slice(highlight.start, highlight.end)).toEqual('sister');
  });

  it('says when it has cut the beginning off', () => {
    const found = search([entry({ id: 'a', entryDate: '2026-05-01', body: long })], [], 'sister');

    expect(found[0]?.snippet.startsWith('…')).toBe(true);
  });

  it('says when it has cut the end off', () => {
    const veryLong = `My sister rang. ${'And then a great deal else happened. '.repeat(20)}`;
    const found = search(
      [entry({ id: 'a', entryDate: '2026-05-01', body: veryLong })],
      [],
      'sister',
    );

    expect(found[0]?.snippet.endsWith('…')).toBe(true);
  });

  // Nothing was cut, so nothing should claim it was.
  it('adds no ellipsis when the whole entry fits', () => {
    const found = search(
      [entry({ id: 'a', entryDate: '2026-05-01', body: 'My sister rang.' })],
      [],
      'sister',
    );

    expect(found[0]?.snippet).not.toContain('…');
  });

  // A snippet starting mid-word reads as a glitch rather than as an excerpt.
  it('cuts at a word boundary', () => {
    const found = search([entry({ id: 'a', entryDate: '2026-05-01', body: long })], [], 'sister');
    const snippet = found[0]?.snippet ?? '';

    expect(snippet.slice(1)).toMatch(/^\S/);
    expect(long).toContain(snippet.replace(/^…/, '').replace(/…$/, ''));
  });

  it('shows a short entry whole, with no ellipsis', () => {
    const found = search(
      [entry({ id: 'a', entryDate: '2026-05-01', body: 'Lunch with my sister.' })],
      [],
      'sister',
    );

    expect(found[0]?.snippet).toEqual('Lunch with my sister.');
  });

  it('marks the hit correctly when the match is at the very start', () => {
    const found = search(
      [entry({ id: 'a', entryDate: '2026-05-01', body: 'Sister came round.' })],
      [],
      'sister',
    );
    const { snippet, highlight } = found[0] as {
      snippet: string;
      highlight: { start: number; end: number };
    };

    expect(snippet.slice(highlight.start, highlight.end)).toEqual('Sister');
  });

  // The snippet keeps the original text, so the marked range has to land on it
  // rather than on the folded version.
  it('marks the hit correctly through an accent', () => {
    const found = search(
      [entry({ id: 'a', entryDate: '2026-05-01', body: 'We sat in the café all afternoon.' })],
      [],
      'cafe',
    );
    const { snippet, highlight } = found[0] as {
      snippet: string;
      highlight: { start: number; end: number };
    };

    expect(snippet.slice(highlight.start, highlight.end)).toEqual('café');
  });
});

describe('splitting a query', () => {
  it('gives one term per word', () => {
    expect(terms('sister birthday')).toEqual(['sister', 'birthday']);
  });

  it('gives nothing for whitespace', () => {
    expect(terms('   ')).toEqual([]);
  });
});
