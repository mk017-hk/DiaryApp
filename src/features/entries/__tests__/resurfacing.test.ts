import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  addQuietDates,
  applyRemoteQuietDates,
  isWithin,
  listQuietDates,
  markQuietDatesSynced,
  rangeAround,
  removeQuietDates,
  unsyncedQuietDates,
  type QuietDates,
} from '../muteStore';
import { createEntry, onThisDay } from '../entryStore';
import { createThread, updateThread } from '../threadStore';

/**
 * Resurfacing, on the device.
 *
 * The same three mutes the database enforces, enforced again here, because the
 * device is the authority for what the screens draw. These are not duplicate
 * tests of the SQL: they are the tests of the half that actually puts the card
 * on somebody's screen on a morning she asked to be left alone.
 */

jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: () => `id-${String(++counter)}` };
});

const draft = (entryDate: string, body: string) => ({
  entryDate,
  entryAt: `${entryDate}T09:00:00.000Z`,
  body,
  mood: 3,
  emotions: [],
  media: [],
  isFavourite: false,
});

/** Local time, so it matches the clock `onThisDay` reads. */
const on = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12);

const bodies = async (date: Date) => (await onThisDay(date)).map((entry) => entry.body);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('what comes back on an ordinary day', () => {
  it('returns the same day from an earlier year', async () => {
    await createEntry(draft('2024-06-15', 'Two years ago.'));

    expect(await bodies(on(2026, 6, 15))).toEqual(['Two years ago.']);
  });

  it('never returns today itself', async () => {
    await createEntry(draft('2026-06-15', 'Written this morning.'));

    expect(await bodies(on(2026, 6, 15))).toEqual([]);
  });

  it('ignores a different day of the same month', async () => {
    await createEntry(draft('2024-06-14', 'A day out.'));

    expect(await bodies(on(2026, 6, 15))).toEqual([]);
  });
});

describe('"do not hand this one back to me"', () => {
  it('keeps an excluded entry away', async () => {
    await createEntry({ ...draft('2024-06-15', 'Mine to keep.'), resurfaceExcluded: true });

    expect(await bodies(on(2026, 6, 15))).toEqual([]);
  });

  // Two different sentences, and either is reasonable without the other.
  it('does not confuse it with being held back from the assistant', async () => {
    await createEntry({ ...draft('2024-06-15', 'Never read, fine to see.'), aiExcluded: true });

    expect(await bodies(on(2026, 6, 15))).toEqual(['Never read, fine to see.']);
  });

  it('still returns the rest of that day', async () => {
    await createEntry({ ...draft('2024-06-15', 'Held back.'), resurfaceExcluded: true });
    await createEntry(draft('2024-06-15', 'Fine.'));

    expect((await bodies(on(2026, 6, 15))).sort()).toEqual(['Fine.']);
  });
});

describe('"stop following this story up"', () => {
  const mutedThread = async () => {
    const thread = await createThread({
      title: 'Trying again',
      isPrivate: false,
      startedOn: '2024-01-01',
    });
    await updateThread(thread.id, { resurfaceMuted: true });
    return thread.id;
  };

  it('keeps every entry in a muted thread away', async () => {
    const threadId = await mutedThread();
    await createEntry({ ...draft('2024-06-15', 'Part of the story.'), threadId });

    expect(await bodies(on(2026, 6, 15))).toEqual([]);
  });

  // A story she does not want read may still be one she wants to remember.
  it('does not mute a thread merely for being private', async () => {
    const thread = await createThread({
      title: 'The quiet one',
      isPrivate: true,
      startedOn: '2024-01-01',
    });
    await createEntry({ ...draft('2024-06-15', 'Private, but mine.'), threadId: thread.id });

    expect(await bodies(on(2026, 6, 15))).toEqual(['Private, but mine.']);
  });

  it('leaves entries outside the thread alone', async () => {
    const threadId = await mutedThread();
    await createEntry({ ...draft('2024-06-15', 'In it.'), threadId });
    await createEntry(draft('2024-06-15', 'Not in it.'));

    expect(await bodies(on(2026, 6, 15))).toEqual(['Not in it.']);
  });

  it('starts resurfacing again when the thread is unmuted', async () => {
    const threadId = await mutedThread();
    await createEntry({ ...draft('2024-06-15', 'Part of the story.'), threadId });
    await updateThread(threadId, { resurfaceMuted: false });

    expect(await bodies(on(2026, 6, 15))).toEqual(['Part of the story.']);
  });
});

describe('quiet dates', () => {
  it('returns nothing on a muted day, however much is there', async () => {
    await createEntry(draft('2024-08-28', 'That week.'));
    await createEntry(draft('2023-08-28', 'And the year before.'));
    await addQuietDates({ fromMonth: 8, fromDay: 25, toMonth: 8, toDay: 31 });

    expect(await bodies(on(2026, 8, 28))).toEqual([]);
  });

  it('leaves the day either side alone', async () => {
    await createEntry(draft('2024-08-24', 'Before.'));
    await createEntry(draft('2024-09-01', 'After.'));
    await addQuietDates({ fromMonth: 8, fromDay: 25, toMonth: 8, toDay: 31 });

    expect(await bodies(on(2026, 8, 24))).toEqual(['Before.']);
    expect(await bodies(on(2026, 9, 1))).toEqual(['After.']);
  });

  // The reason a mute is a month and a day rather than a pair of dates: it has
  // to still be there the year after, and the year after that.
  it('applies in every year, not only the one it was set in', async () => {
    await createEntry(draft('2019-08-28', 'Long ago.'));
    await addQuietDates({ fromMonth: 8, fromDay: 25, toMonth: 8, toDay: 31 });

    expect(await bodies(on(2031, 8, 28))).toEqual([]);
  });

  it('covers a range that wraps the new year', async () => {
    await createEntry(draft('2024-12-29', 'December.'));
    await createEntry(draft('2024-01-02', 'January.'));
    await addQuietDates({ fromMonth: 12, fromDay: 28, toMonth: 1, toDay: 3 });

    expect(await bodies(on(2026, 12, 29))).toEqual([]);
    expect(await bodies(on(2026, 1, 2))).toEqual([]);
  });

  it('resurfaces again once the mute is lifted', async () => {
    await createEntry(draft('2024-03-04', 'That day.'));
    const mute = await addQuietDates({ fromMonth: 3, fromDay: 1, toMonth: 3, toDay: 7 });

    expect(await bodies(on(2026, 3, 4))).toEqual([]);

    await removeQuietDates(mute.id);

    expect(await bodies(on(2026, 3, 4))).toEqual(['That day.']);
  });

  it('lists them in the order they come round in the year', async () => {
    await addQuietDates({ fromMonth: 11, fromDay: 18, toMonth: 11, toDay: 22 });
    await addQuietDates({ fromMonth: 3, fromDay: 1, toMonth: 3, toDay: 7 });

    expect((await listQuietDates()).map((mute) => mute.fromMonth)).toEqual([3, 11]);
  });

  it('does not list one that has been lifted', async () => {
    const mute = await addQuietDates({ fromMonth: 3, fromDay: 1, toMonth: 3, toDay: 7 });
    await removeQuietDates(mute.id);

    expect(await listQuietDates()).toEqual([]);
  });
});

describe('the range arithmetic on its own', () => {
  const range = (from: [number, number], to: [number, number]): QuietDates => ({
    id: 'm',
    fromMonth: from[0],
    fromDay: from[1],
    toMonth: to[0],
    toDay: to[1],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  it('handles an ordinary range', () => {
    const august = range([8, 25], [8, 31]);

    expect(isWithin(august, 8, 28)).toBe(true);
    expect(isWithin(august, 8, 24)).toBe(false);
    expect(isWithin(august, 9, 1)).toBe(false);
  });

  it('handles a range spanning two months', () => {
    const across = range([8, 25], [9, 5]);

    expect(isWithin(across, 8, 30)).toBe(true);
    expect(isWithin(across, 9, 2)).toBe(true);
    expect(isWithin(across, 9, 6)).toBe(false);
  });

  // The case most likely to be written backwards.
  it('handles a range wrapping the new year', () => {
    const newYear = range([12, 28], [1, 3]);

    expect(isWithin(newYear, 12, 29)).toBe(true);
    expect(isWithin(newYear, 1, 2)).toBe(true);
    expect(isWithin(newYear, 12, 27)).toBe(false);
    expect(isWithin(newYear, 1, 4)).toBe(false);
    expect(isWithin(newYear, 6, 15)).toBe(false);
  });

  it('handles a single day', () => {
    const oneDay = range([3, 4], [3, 4]);

    expect(isWithin(oneDay, 3, 4)).toBe(true);
    expect(isWithin(oneDay, 3, 5)).toBe(false);
  });
});

describe('a range either side of one date', () => {
  it('turns a single day into a range of one day', () => {
    expect(rangeAround(8, 28, 0)).toEqual({
      fromMonth: 8,
      fromDay: 28,
      toMonth: 8,
      toDay: 28,
    });
  });

  it('spreads a week either side', () => {
    expect(rangeAround(8, 28, 3)).toEqual({
      fromMonth: 8,
      fromDay: 25,
      toMonth: 8,
      toDay: 31,
    });
  });

  it('runs into the next month when it has to', () => {
    expect(rangeAround(8, 30, 3)).toEqual({
      fromMonth: 8,
      fromDay: 27,
      toMonth: 9,
      toDay: 2,
    });
  });

  // Nothing special-cased: the arithmetic rolls over the year and only the
  // month and day are kept.
  it('wraps the new year', () => {
    expect(rangeAround(12, 31, 3)).toEqual({
      fromMonth: 12,
      fromDay: 28,
      toMonth: 1,
      toDay: 3,
    });
    expect(rangeAround(1, 1, 3)).toEqual({
      fromMonth: 12,
      fromDay: 29,
      toMonth: 1,
      toDay: 4,
    });
  });

  // The reason the arithmetic runs in a leap year: 29 February has to be a
  // date somebody can choose, and a mute set on it has to hold.
  it('accepts the 29th of February', () => {
    expect(rangeAround(2, 29, 1)).toEqual({
      fromMonth: 2,
      fromDay: 28,
      toMonth: 3,
      toDay: 1,
    });
  });

  it('produces a range the mute check then agrees with', () => {
    const range = rangeAround(12, 31, 3);
    const mute = {
      id: 'm',
      ...range,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    expect(isWithin(mute, 12, 31)).toBe(true);
    expect(isWithin(mute, 1, 2)).toBe(true);
    expect(isWithin(mute, 7, 1)).toBe(false);
  });
});

describe('mutes reaching the other phone', () => {
  const remote = (id: string, updatedAt: string, from: [number, number]): QuietDates => ({
    id,
    fromMonth: from[0],
    fromDay: from[1],
    toMonth: from[0],
    toDay: from[1],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
  });

  it('queues a new mute for the account', async () => {
    await addQuietDates({ fromMonth: 3, fromDay: 1, toMonth: 3, toDay: 7 });

    expect(await unsyncedQuietDates()).toHaveLength(1);
  });

  it('stops queueing it once the account has it', async () => {
    const mute = await addQuietDates({ fromMonth: 3, fromDay: 1, toMonth: 3, toDay: 7 });
    await markQuietDatesSynced([mute.id]);

    expect(await unsyncedQuietDates()).toEqual([]);
  });

  it('takes a mute set on the other phone', async () => {
    await applyRemoteQuietDates([remote('elsewhere', '2026-02-01T00:00:00.000Z', [5, 1])]);

    expect((await listQuietDates()).map((mute) => mute.id)).toEqual(['elsewhere']);
  });

  // The only way a lift reaches the phone that did not make it. The pull is the
  // complete set, so a mute this device has already pushed and that is no
  // longer there was lifted somewhere else.
  it('lifts a mute the account no longer has', async () => {
    const mute = await addQuietDates({ fromMonth: 3, fromDay: 1, toMonth: 3, toDay: 7 });
    await markQuietDatesSynced([mute.id]);

    await applyRemoteQuietDates([]);

    expect(await listQuietDates()).toEqual([]);
  });

  // An empty first pull on a newly signed-in phone must not delete the quiet
  // dates somebody set up a minute ago while offline.
  it('keeps a mute that has never been pushed', async () => {
    await addQuietDates({ fromMonth: 3, fromDay: 1, toMonth: 3, toDay: 7 });

    await applyRemoteQuietDates([]);

    expect(await listQuietDates()).toHaveLength(1);
  });

  it('keeps the newer of the two when both have changed', async () => {
    const mute = await addQuietDates({ fromMonth: 3, fromDay: 1, toMonth: 3, toDay: 7 });

    await applyRemoteQuietDates([remote(mute.id, '1999-01-01T00:00:00.000Z', [9, 9])]);

    expect((await listQuietDates())[0]?.fromMonth).toEqual(3);
  });

  it('forgets a lifted mute once the account has carried out the lift', async () => {
    const mute = await addQuietDates({ fromMonth: 3, fromDay: 1, toMonth: 3, toDay: 7 });
    await markQuietDatesSynced([mute.id]);
    await removeQuietDates(mute.id);

    await markQuietDatesSynced([mute.id]);

    expect(await unsyncedQuietDates()).toEqual([]);
    expect(await listQuietDates()).toEqual([]);
  });
});
