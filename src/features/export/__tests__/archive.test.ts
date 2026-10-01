import type { Entry, QuietDates, Thread } from '@/features/entries';
import type { Letter } from '@/features/letters';
import type { Profile } from '@/features/profile/profileStore';

import { STORES, buildArchive, renderArchiveHtml, type ArchiveInput } from '../archive';

/**
 * The export.
 *
 * One rule runs through all of this: an export that quietly omits something is
 * worse than no export, because somebody who has one believes they have their
 * diary. So most of these tests are about completeness rather than formatting,
 * and several of them exist to fail when a future feature adds a store and
 * forgets this file.
 */

const entry = (overrides: Partial<Entry> & { id: string; entryDate: string }): Entry => ({
  entryAt: `${overrides.entryDate}T09:00:00.000Z`,
  body: 'Something that happened.',
  mood: 3,
  emotions: [],
  media: [],
  isFavourite: false,
  createdAt: `${overrides.entryDate}T09:00:00.000Z`,
  updatedAt: `${overrides.entryDate}T09:00:00.000Z`,
  ...overrides,
});

const profile: Profile = {
  name: 'Mari',
  intentions: ['record'],
  tone: 'warm',
  capture: 'either',
  onboardedAt: '2026-01-01T00:00:00.000Z',
};

const input = (overrides: Partial<ArchiveInput> = {}): ArchiveInput => ({
  entries: [],
  threads: [],
  quietDates: [],
  letters: [],
  profile,
  exportedAt: new Date('2026-10-01T12:00:00.000Z'),
  ...overrides,
});

describe('what goes in', () => {
  it('carries every entry, oldest first', () => {
    const archive = buildArchive(
      input({
        entries: [
          entry({ id: 'b', entryDate: '2026-05-02', body: 'Second.' }),
          entry({ id: 'a', entryDate: '2026-05-01', body: 'First.' }),
        ],
      }),
    );

    expect(archive.entries.map((row) => row.body)).toEqual(['First.', 'Second.']);
  });

  // A tombstone is sync bookkeeping, not something she wrote.
  it('leaves out deleted entries', () => {
    const archive = buildArchive(
      input({
        entries: [
          entry({ id: 'a', entryDate: '2026-05-01', body: 'Kept.' }),
          entry({
            id: 'b',
            entryDate: '2026-05-02',
            body: 'Deleted.',
            deletedAt: '2026-05-03T00:00:00.000Z',
          }),
        ],
      }),
    );

    expect(archive.entries.map((row) => row.body)).toEqual(['Kept.']);
  });

  it('names the mood rather than only numbering it', () => {
    const archive = buildArchive(
      input({ entries: [entry({ id: 'a', entryDate: '2026-05-01', mood: 1 })] }),
    );

    expect(archive.entries[0]?.moodLabel).toEqual('Heavy');
  });

  it('copes with an entry that answered no mood', () => {
    const archive = buildArchive(
      input({ entries: [entry({ id: 'a', entryDate: '2026-05-01', mood: null })] }),
    );

    expect(archive.entries[0]?.mood).toBeNull();
    expect(archive.entries[0]?.moodLabel).toBeNull();
  });

  // The ids are internal. A thread called "trying again" means something to
  // her; a uuid does not.
  it('names the thread an entry belonged to', () => {
    const thread: Thread = {
      id: 't-1',
      title: 'Trying again',
      status: 'open',
      isPrivate: false,
      startedOn: '2026-01-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const archive = buildArchive(
      input({
        threads: [thread],
        entries: [entry({ id: 'a', entryDate: '2026-05-01', threadId: 't-1' })],
      }),
    );

    expect(archive.entries[0]?.thread).toEqual('Trying again');
  });

  /**
   * The choices she made are part of her data.
   *
   * An export that dropped these would be quietly deciding that what she asked
   * the app to do with an entry was the app's business rather than hers.
   */
  it('keeps the flags she set on an entry', () => {
    const archive = buildArchive(
      input({
        entries: [
          entry({
            id: 'a',
            entryDate: '2026-05-01',
            aiExcluded: true,
            resurfaceExcluded: true,
            isPersonal: true,
          }),
        ],
      }),
    );

    expect(archive.entries[0]).toMatchObject({
      keptFromAssistant: true,
      keptFromResurfacing: true,
      personal: true,
    });
  });

  it('carries threads, quiet dates and the profile', () => {
    const archive = buildArchive(
      input({
        threads: [
          {
            id: 't-1',
            title: 'The move',
            status: 'closed',
            isPrivate: false,
            startedOn: '2026-01-01',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        quietDates: [
          {
            id: 'm-1',
            fromMonth: 8,
            fromDay: 25,
            toMonth: 8,
            toDay: 31,
            label: 'That week',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );

    expect(archive.threads[0]?.title).toEqual('The move');
    expect(archive.quietDates[0]).toEqual({
      from: '25 August',
      to: '31 August',
      label: 'That week',
    });
    expect(archive.profile.name).toEqual('Mari');
  });

  it('leaves out a quiet date that was lifted', () => {
    const lifted: QuietDates = {
      id: 'm-1',
      fromMonth: 3,
      fromDay: 1,
      toMonth: 3,
      toDay: 7,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: '2026-02-01T00:00:00.000Z',
    };

    expect(buildArchive(input({ quietDates: [lifted] })).quietDates).toEqual([]);
  });

  // The consent record is exactly the sort of thing a data export exists for.
  it('carries the consent she gave', () => {
    const archive = buildArchive(input({ profile: { ...profile, assistantConsent: true } }));

    expect(archive.profile.assistantConsent).toBe(true);
  });

  it('says when the diary runs from and to', () => {
    const archive = buildArchive(
      input({
        entries: [
          entry({ id: 'a', entryDate: '2026-01-04' }),
          entry({ id: 'b', entryDate: '2026-09-30' }),
        ],
      }),
    );

    expect(archive.diary).toMatchObject({ from: '2026-01-04', to: '2026-09-30', entryCount: 2 });
  });

  it('describes an empty diary without inventing a span', () => {
    const archive = buildArchive(input());

    expect(archive.diary).toMatchObject({ from: null, to: null, entryCount: 0 });
  });
});

describe('media', () => {
  // The files are far too large to travel inside the archive, so each one says
  // where to go and get it instead.
  it('sends a photo to the place a save puts it', () => {
    const archive = buildArchive(
      input({
        entries: [
          entry({
            id: 'a',
            entryDate: '2026-05-01',
            media: [{ id: 'm-1', kind: 'photo', uri: 'file:///documents/photos/m-1.jpg' }],
          }),
        ],
      }),
    );

    expect(archive.entries[0]?.media[0]?.storedIn).toEqual('photo library');
  });

  // The photo library has nowhere to put an audio file. Saying so beats
  // claiming it went somewhere it did not.
  it('says a voice note stays on the phone', () => {
    const archive = buildArchive(
      input({
        entries: [
          entry({
            id: 'a',
            entryDate: '2026-05-01',
            media: [{ id: 'm-1', kind: 'audio', uri: 'file:///documents/audio/m-1.m4a' }],
          }),
        ],
      }),
    );

    expect(archive.entries[0]?.media[0]?.storedIn).toEqual('this phone');
  });

  // A device filesystem path means nothing on another machine, and putting one
  // in an archive would be exporting this phone rather than her diary.
  it('never writes a device path into the archive', () => {
    const archive = buildArchive(
      input({
        entries: [
          entry({
            id: 'a',
            entryDate: '2026-05-01',
            media: [{ id: 'm-1', kind: 'video', uri: 'file:///documents/videos/m-1.mov' }],
          }),
        ],
      }),
    );

    expect(JSON.stringify(archive)).not.toContain('file://');
  });

  // Saying so, rather than leaving a gap she would have to notice herself.
  it('records media that was only ever in the account', () => {
    const archive = buildArchive(
      input({
        entries: [
          entry({
            id: 'a',
            entryDate: '2026-05-01',
            media: [{ id: 'm-1', kind: 'video', remotePath: 'diary/e/m-1.mov' }],
          }),
        ],
      }),
    );

    expect(archive.entries[0]?.media[0]?.storedIn).toEqual('your account');
    expect(archive.entries[0]?.media[0]?.remotePath).toEqual('diary/e/m-1.mov');
  });
});

describe('letters', () => {
  const sealed: Letter = {
    id: 'l-1',
    unlockOn: '2030-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  // Leaving it out would be the export quietly agreeing that a sealed letter
  // does not exist. It does; its contents are simply not available to anyone,
  // which is the feature working.
  it('records a sealed letter as sealed rather than omitting it', () => {
    const archive = buildArchive(input({ letters: [sealed] }));

    expect(archive.letters[0]).toMatchObject({ opensOn: '2030-01-01', sealed: true });
    expect(archive.letters[0]?.body).toBeUndefined();
  });

  it('carries the body of one that has been opened', () => {
    const archive = buildArchive(input({ letters: [{ ...sealed, body: 'Dear you,' }] }));

    expect(archive.letters[0]).toMatchObject({ body: 'Dear you,', sealed: false });
  });
});

/**
 * Completeness, as a test rather than as a promise.
 *
 * The way an export goes wrong is not by being written badly. It is by a
 * feature shipping six months later whose data nobody thought to add.
 */
describe('nothing is quietly left out', () => {
  it('has a section for every store the app keeps', () => {
    const archive = buildArchive(input());

    for (const store of STORES) {
      expect(archive).toHaveProperty(store);
    }
  });

  it('declares a version, so a reader can tell what it is looking at', () => {
    expect(buildArchive(input()).version).toEqual(1);
  });

  it('says when it was made', () => {
    expect(buildArchive(input()).exportedAt).toEqual('2026-10-01T12:00:00.000Z');
  });
});

describe('the page a person can actually read', () => {
  const archive = buildArchive(
    input({
      entries: [
        entry({
          id: 'a',
          entryDate: '2026-05-01',
          body: 'The kitchen light was still on.',
          mood: 2,
          emotions: ['sad'],
        }),
      ],
    }),
  );

  it('is a whole document, not a fragment', () => {
    const html = renderArchiveHtml(archive);

    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('</html>');
  });

  // It has to open off a memory stick in ten years with this app long gone.
  it('needs nothing from the network', () => {
    const html = renderArchiveHtml(archive);

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('contains what she wrote', () => {
    expect(renderArchiveHtml(archive)).toContain('The kitchen light was still on.');
  });

  it('writes dates the way a person reads them', () => {
    expect(renderArchiveHtml(archive)).toContain('1 May 2026');
  });

  // Her own words are her own words, and an apostrophe or a less-than sign in
  // an entry must not be able to break the page, let alone inject into it.
  it('escapes what she wrote rather than trusting it', () => {
    const risky = buildArchive(
      input({
        entries: [
          entry({
            id: 'a',
            entryDate: '2026-05-01',
            body: 'I wrote <script>alert(1)</script> & meant it',
          }),
        ],
      }),
    );

    const html = renderArchiveHtml(risky);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('escapes a name as well as a body', () => {
    const risky = buildArchive(input({ profile: { ...profile, name: '<b>Mari</b>' } }));

    expect(renderArchiveHtml(risky)).not.toContain('<b>Mari</b>');
  });

  // A sentence rather than a broken image icon, which would read as the export
  // having lost something.
  it('says where each file went, in words', () => {
    const withMedia = buildArchive(
      input({
        entries: [
          entry({
            id: 'a',
            entryDate: '2026-05-01',
            media: [
              { id: 'p', kind: 'photo', uri: 'file:///p.jpg' },
              { id: 'n', kind: 'audio', uri: 'file:///n.m4a' },
              { id: 'r', kind: 'video', remotePath: 'diary/e/r.mov' },
            ],
          }),
        ],
      }),
    );

    const html = renderArchiveHtml(withMedia);

    expect(html).toContain('Diary album in your photos');
    expect(html).toContain('kept on the phone');
    expect(html).toContain('kept in your account');
  });

  it('never leaves a tag pointing at a file it did not bring', () => {
    const withMedia = buildArchive(
      input({
        entries: [
          entry({
            id: 'a',
            entryDate: '2026-05-01',
            media: [{ id: 'p', kind: 'photo', uri: 'file:///p.jpg' }],
          }),
        ],
      }),
    );

    const html = renderArchiveHtml(withMedia);

    expect(html).not.toMatch(/<img|<video|<audio/);
  });

  it('says a sealed letter is sealed rather than showing an empty one', () => {
    const withLetter = buildArchive(
      input({
        letters: [{ id: 'l', unlockOn: '2030-01-01', createdAt: '2026-01-01T00:00:00.000Z' }],
      }),
    );

    expect(renderArchiveHtml(withLetter)).toContain('not even this export can read it');
  });

  it('renders an empty diary without falling over', () => {
    expect(() => renderArchiveHtml(buildArchive(input()))).not.toThrow();
  });
});
