import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Entry, EntryMedia } from '@/features/entries/entryStore';

import {
  autoReflect,
  finishReflection,
  MAX_ATTEMPTS,
  pendingReflections,
  queueReflection,
  readiness,
  retryLater,
  setAutoReflect,
} from '../queue';

/**
 * Waiting for the assistant's notes.
 *
 * The rule that matters: an entry is only sent once it is ready — its
 * recordings transcribed, and everything in the account — so the notes are
 * about what she actually said, and never asked for on something the
 * assistant has been told not to read.
 */

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  entryDate: '2026-11-06',
  entryAt: '2026-11-06T09:00:00.000Z',
  body: 'A long day.',
  mood: null,
  emotions: [],
  media: [],
  isFavourite: false,
  createdAt: '2026-11-06T09:00:00.000Z',
  updatedAt: '2026-11-06T09:00:00.000Z',
  unsynced: false,
  ...over,
});

const video = (over: Partial<EntryMedia> = {}): EntryMedia => ({
  id: 'v1',
  kind: 'video',
  uri: 'file:///clip.mov',
  remotePath: 'd/e/v1.mov',
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('when an entry is ready', () => {
  it('is ready once it has reached the account', () => {
    expect(readiness(entry(), true)).toBe('ready');
  });

  it('waits until it has synced', () => {
    expect(readiness(entry({ unsynced: true }), true)).toBe('waiting');
  });

  it('waits for its recording to be transcribed, where this phone can', () => {
    expect(readiness(entry({ media: [video()] }), true)).toBe('waiting');
    expect(readiness(entry({ media: [video({ transcriptStatus: 'pending' })] }), true)).toBe(
      'waiting',
    );
  });

  it('does not wait for words that are never coming, on a build that cannot transcribe', () => {
    expect(readiness(entry({ media: [video()] }), false)).toBe('ready');
  });

  it('waits for the transcript to reach the account too', () => {
    const transcribed = video({
      transcriptStatus: 'done',
      transcript: 'hi',
      transcriptSynced: false,
    });
    expect(readiness(entry({ media: [transcribed] }), true)).toBe('waiting');
    expect(readiness(entry({ media: [{ ...transcribed, transcriptSynced: true }] }), true)).toBe(
      'ready',
    );
  });

  it('goes ahead when transcription failed, with whatever was written', () => {
    expect(readiness(entry({ media: [video({ transcriptStatus: 'failed' })] }), true)).toBe(
      'ready',
    );
  });

  it('is never sent when it was held back or kept just for her', () => {
    expect(readiness(entry({ aiExcluded: true }), true)).toBe('never');
    expect(readiness(entry({ isPersonal: true }), true)).toBe('never');
  });

  it('is dropped when it no longer exists', () => {
    expect(readiness(null, true)).toBe('gone');
    expect(readiness(entry({ deletedAt: '2026-11-06T10:00:00.000Z' }), true)).toBe('gone');
  });

  it('ignores photos, which have nothing to transcribe', () => {
    const photo: EntryMedia = { id: 'p1', kind: 'photo', uri: 'file:///p.jpg' };
    expect(readiness(entry({ media: [photo] }), true)).toBe('ready');
  });
});

describe('the queue', () => {
  it('holds each entry once', async () => {
    await queueReflection('e1');
    await queueReflection('e1');
    expect(await pendingReflections()).toEqual([{ entryId: 'e1', attempts: 0 }]);
  });

  it('lets an entry go once it is done with', async () => {
    await queueReflection('e1');
    await finishReflection('e1');
    expect(await pendingReflections()).toEqual([]);
  });

  it(`gives up after ${String(MAX_ATTEMPTS)} failed tries`, async () => {
    await queueReflection('e1');
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) await retryLater('e1');
    expect(await pendingReflections()).toHaveLength(1);
    await retryLater('e1');
    expect(await pendingReflections()).toEqual([]);
  });

  it('starts the tries again when the entry is edited while waiting', async () => {
    await queueReflection('e1');
    await retryLater('e1');
    await queueReflection('e1');
    expect(await pendingReflections()).toEqual([{ entryId: 'e1', attempts: 0 }]);
  });
});

it('reflects on new entries by default, and can be turned off', async () => {
  expect(await autoReflect()).toBe(true);
  await setAutoReflect(false);
  expect(await autoReflect()).toBe(false);
});
