import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createEntry,
  datesWithEntries,
  deleteEntry,
  entriesForDate,
  getEntry,
  listEntries,
  onThisDay,
  updateEntry,
  type NewEntry,
} from '../entryStore';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItem: jest.fn(async (k: string) => store.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      store.delete(k);
    }),
  };
});

jest.mock('expo-crypto', () => {
  let counter = 0;
  return {
    randomUUID: jest.fn(() => `id-${String(++counter)}`),
  };
});

const store = (AsyncStorage as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
});

const draft = (overrides: Partial<NewEntry> = {}): NewEntry => ({
  entryDate: '2026-08-30',
  entryAt: '2026-08-30T18:00:00.000Z',
  body: 'A thing that happened.',
  mood: 3,
  emotions: [],
  isFavourite: false,
  ...overrides,
});

describe('creating and reading entries', () => {
  it('round-trips an entry', async () => {
    const created = await createEntry(draft());
    expect(await getEntry(created.id)).toEqual(created);
  });

  it('returns null for an id that does not exist', async () => {
    expect(await getEntry('nope')).toBeNull();
  });

  it('lists newest first', async () => {
    await createEntry(draft({ entryDate: '2026-08-01', entryAt: '2026-08-01T09:00:00.000Z' }));
    await createEntry(draft({ entryDate: '2026-08-30', entryAt: '2026-08-30T09:00:00.000Z' }));

    const entries = await listEntries();
    expect(entries.map((e) => e.entryDate)).toEqual(['2026-08-30', '2026-08-01']);
  });

  it('starts empty rather than throwing', async () => {
    expect(await listEntries()).toEqual([]);
  });

  it('survives corrupt stored data', async () => {
    store.set('entries.v1', 'not json at all');
    expect(await listEntries()).toEqual([]);
  });
});

describe('updating and deleting', () => {
  it('patches only the fields given, and moves updatedAt', async () => {
    const created = await createEntry(draft());
    const updated = await updateEntry(created.id, { isFavourite: true });

    expect(updated?.isFavourite).toBe(true);
    expect(updated?.body).toEqual(created.body);
    expect(updated?.createdAt).toEqual(created.createdAt);
  });

  it('returns null when updating something that is gone', async () => {
    expect(await updateEntry('nope', { body: 'x' })).toBeNull();
  });

  it('removes an entry', async () => {
    const created = await createEntry(draft());
    await deleteEntry(created.id);

    expect(await getEntry(created.id)).toBeNull();
    expect(await listEntries()).toEqual([]);
  });
});

describe('finding entries by day', () => {
  it('returns only the entries written on that date', async () => {
    await createEntry(draft({ entryDate: '2026-08-30' }));
    await createEntry(draft({ entryDate: '2026-08-29' }));

    expect(await entriesForDate('2026-08-30')).toHaveLength(1);
    expect(await entriesForDate('2026-01-01')).toEqual([]);
  });

  it('reports which days have something on them, for the calendar', async () => {
    await createEntry(draft({ entryDate: '2026-08-30' }));
    await createEntry(draft({ entryDate: '2026-08-30' }));
    await createEntry(draft({ entryDate: '2026-08-28' }));

    const marked = await datesWithEntries();
    expect(marked.has('2026-08-30')).toBe(true);
    expect(marked.has('2026-08-28')).toBe(true);
    expect(marked.size).toBe(2);
  });
});

describe('on this day', () => {
  const today = new Date(2026, 7, 30); // 30 August 2026

  it('finds the same date in earlier years', async () => {
    await createEntry(draft({ entryDate: '2024-08-30' }));
    await createEntry(draft({ entryDate: '2023-08-30' }));

    const memories = await onThisDay(today);
    expect(memories.map((m) => m.entryDate).sort()).toEqual(['2023-08-30', '2024-08-30']);
  });

  it('excludes today itself, which is not a memory yet', async () => {
    await createEntry(draft({ entryDate: '2026-08-30' }));
    expect(await onThisDay(today)).toEqual([]);
  });

  it('ignores the same day number in a different month', async () => {
    await createEntry(draft({ entryDate: '2024-07-30' }));
    expect(await onThisDay(today)).toEqual([]);
  });

  it('ignores a different day in the same month', async () => {
    await createEntry(draft({ entryDate: '2024-08-29' }));
    expect(await onThisDay(today)).toEqual([]);
  });
});
