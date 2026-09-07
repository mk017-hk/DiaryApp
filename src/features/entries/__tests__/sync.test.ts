import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  allEntries,
  applyRemote,
  createEntry,
  deleteEntry,
  listEntries,
  updateEntry,
  type Entry,
} from '../entryStore';
import {
  __testing,
  readWatermark,
  resetSyncState,
  syncEntries,
  type PullOutcome,
  type PushOutcome,
  type RemoteResult,
  type SyncRemote,
} from '../sync';

/**
 * The conflict logic, against a fake server.
 *
 * This is the half of sync where the bugs are: two devices, one entry, edits
 * made in an order nobody controls. The real database is tested separately —
 * these run in milliseconds so the awkward orderings can all be written down.
 */

jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: () => `id-${String(++counter)}` };
});

const failure = { kind: 'network', userMessage: 'offline' } as never;

class FakeRemote implements SyncRemote {
  pushed: Entry[][] = [];
  pullSince: (string | null)[] = [];

  /** What the server will claim it holds after a push. Defaults to echoing. */
  pushResponse: ((entries: Entry[]) => RemoteResult<PushOutcome>) | null = null;
  pullResponse: RemoteResult<PullOutcome> = { ok: true, value: { entries: [], watermark: null } };

  async push(entries: Entry[]): Promise<RemoteResult<PushOutcome>> {
    this.pushed.push(entries);
    if (this.pushResponse !== null) return this.pushResponse(entries);

    const accepted = entries.map((entry) => ({ ...entry, unsynced: false }));
    return {
      ok: true,
      value: {
        accepted,
        deleted: accepted.filter((e) => e.deletedAt !== undefined).map((e) => e.id),
      },
    };
  }

  async pull(since: string | null): Promise<RemoteResult<PullOutcome>> {
    this.pullSince.push(since);
    return this.pullResponse;
  }
}

const remoteEntry = (over: Partial<Entry> = {}): Entry => ({
  id: 'remote-1',
  entryDate: '2026-09-01',
  entryAt: '2026-09-01T10:00:00.000Z',
  body: 'From the server.',
  mood: 3,
  emotions: [],
  isFavourite: false,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  unsynced: false,
  ...over,
});

const draft = {
  entryDate: '2026-09-01',
  entryAt: '2026-09-01T09:00:00.000Z',
  body: 'Written here.',
  mood: 3,
  emotions: [],
  isFavourite: false,
};

let remote: FakeRemote;

beforeEach(async () => {
  await AsyncStorage.clear();
  __testing.reset();
  remote = new FakeRemote();
});

describe('pushing what the device holds', () => {
  it('sends entries that have never been pushed, and stops sending them after', async () => {
    await createEntry(draft);

    const first = await syncEntries(remote);
    expect(first.status).toEqual('ok');
    expect(first.pushed).toEqual(1);
    expect(remote.pushed[0]).toHaveLength(1);

    const second = await syncEntries(remote);
    expect(second.pushed).toEqual(0);
    expect(remote.pushed[1]).toBeUndefined();
  });

  it('sends an edit made after the first push', async () => {
    const entry = await createEntry(draft);
    await syncEntries(remote);

    await updateEntry(entry.id, { body: 'Changed my mind.' });
    await syncEntries(remote);

    expect(remote.pushed[1]?.[0]?.body).toEqual('Changed my mind.');
  });

  // Entries written before sync existed have no flag on them at all. They have
  // never been pushed, and must not be quietly stranded on one phone.
  it('sends entries stored before sync existed', async () => {
    await AsyncStorage.setItem(
      'entries.v1',
      JSON.stringify([{ ...remoteEntry({ id: 'old-1' }), unsynced: undefined }]),
    );

    await syncEntries(remote);

    expect(remote.pushed[0]?.map((e) => e.id)).toEqual(['old-1']);
  });

  it('keeps everything queued when the push fails', async () => {
    await createEntry(draft);
    remote.pushResponse = () => ({ ok: false, error: failure });

    const report = await syncEntries(remote);

    expect(report.status).toEqual('failed');
    expect((await allEntries())[0]?.unsynced).toBe(true);
  });

  it('does not pull when the push failed', async () => {
    await createEntry(draft);
    remote.pushResponse = () => ({ ok: false, error: failure });

    await syncEntries(remote);

    expect(remote.pullSince).toEqual([]);
  });
});

describe('when two devices edited the same entry', () => {
  // The database keeps the newer edit and hands it back. This device has to
  // take that answer rather than assume its own write landed.
  it('adopts the winner when our push lost', async () => {
    const entry = await createEntry(draft);

    remote.pushResponse = () => ({
      ok: true,
      value: {
        accepted: [
          remoteEntry({
            id: entry.id,
            body: 'The other phone wrote this later.',
            updatedAt: '2099-01-01T00:00:00.000Z',
          }),
        ],
        deleted: [],
      },
    });

    await syncEntries(remote);

    const stored = await listEntries();
    expect(stored[0]?.body).toEqual('The other phone wrote this later.');
    expect(stored[0]?.unsynced).toBe(false);
  });

  it('keeps a local edit that is newer than what arrives in a pull', async () => {
    const entry = await createEntry(draft);
    await syncEntries(remote);
    await updateEntry(entry.id, { body: 'Newer, written here.' });

    remote.pullResponse = {
      ok: true,
      value: {
        entries: [
          remoteEntry({
            id: entry.id,
            body: 'Older, from there.',
            updatedAt: '2000-01-01T00:00:00.000Z',
          }),
        ],
        watermark: '2000-01-01T00:00:00.000Z',
      },
    };

    // A second pass: the push goes first, so the local edit is already sent.
    await syncEntries(remote);

    expect((await listEntries())[0]?.body).toEqual('Newer, written here.');
  });

  it('takes a pulled row that is newer than an unpushed local edit', async () => {
    await applyRemote([remoteEntry({ id: 'shared', updatedAt: '2026-09-01T10:00:00.000Z' })]);
    await updateEntry('shared', { body: 'Edited here, offline.' });

    remote.pushResponse = () => ({ ok: true, value: { accepted: [], deleted: [] } });
    remote.pullResponse = {
      ok: true,
      value: {
        entries: [
          remoteEntry({
            id: 'shared',
            body: 'Much newer, elsewhere.',
            updatedAt: '2099-01-01T00:00:00.000Z',
          }),
        ],
        watermark: '2099-01-01T00:00:00.000Z',
      },
    };

    await syncEntries(remote);

    expect((await listEntries())[0]?.body).toEqual('Much newer, elsewhere.');
  });
});

describe('media pointers, which only this device knows about', () => {
  // The server stores media as a path in a bucket and has no idea where the
  // file sits on any given phone. A pull that took the remote row wholesale
  // would blank these — and the phone that recorded the video is exactly the
  // one that would lose it.
  it('keeps the local video and poster when a pulled row overwrites the entry', async () => {
    const entry = await createEntry({
      ...draft,
      videoUri: 'file:///documents/videos/clip.mov',
      posterUri: 'file:///documents/posters/clip.jpg',
    });
    await syncEntries(remote);

    remote.pullResponse = {
      ok: true,
      value: {
        entries: [
          remoteEntry({
            id: entry.id,
            body: 'Edited elsewhere.',
            updatedAt: '2099-01-01T00:00:00.000Z',
          }),
        ],
        watermark: '2099-01-01T00:00:00.000Z',
      },
    };

    __testing.reset();
    await syncEntries(remote);

    const stored = (await listEntries())[0];
    expect(stored?.body).toEqual('Edited elsewhere.');
    expect(stored?.videoUri).toEqual('file:///documents/videos/clip.mov');
    expect(stored?.posterUri).toEqual('file:///documents/posters/clip.jpg');
  });

  it('keeps a local transcript the server does not carry', async () => {
    const entry = await createEntry({ ...draft, transcript: 'What I actually said.' });
    await syncEntries(remote);

    remote.pullResponse = {
      ok: true,
      value: {
        entries: [remoteEntry({ id: entry.id, updatedAt: '2099-01-01T00:00:00.000Z' })],
        watermark: '2099-01-01T00:00:00.000Z',
      },
    };

    __testing.reset();
    await syncEntries(remote);

    expect((await listEntries())[0]?.transcript).toEqual('What I actually said.');
  });
});

describe('deleting', () => {
  it('pushes the tombstone, then removes the entry for good', async () => {
    const entry = await createEntry(draft);
    await syncEntries(remote);
    await deleteEntry(entry.id);

    const removedIds: string[] = [];
    const report = await syncEntries(remote, {
      onRemoved: async (ids) => {
        removedIds.push(...ids);
      },
    });

    expect(remote.pushed[1]?.[0]?.deletedAt).toBeDefined();
    expect(removedIds).toEqual([entry.id]);
    expect(await allEntries()).toEqual([]);
    expect(report.removed).toEqual(1);
  });

  it('hides a deleted entry from every screen immediately, before any push', async () => {
    const entry = await createEntry(draft);
    await deleteEntry(entry.id);

    expect(await listEntries()).toEqual([]);
    // Still on the device, because the server has not been told yet.
    expect(await allEntries()).toHaveLength(1);
  });

  // Deleting an entry that was never pushed still has to reach the server, or
  // a device that pulls later would create it from nothing.
  it('pushes a tombstone for an entry the server never saw', async () => {
    const entry = await createEntry(draft);
    await deleteEntry(entry.id);

    await syncEntries(remote);

    expect(remote.pushed[0]?.[0]?.id).toEqual(entry.id);
    expect(remote.pushed[0]?.[0]?.deletedAt).toBeDefined();
  });

  it('removes an entry deleted on another device, and its files with it', async () => {
    await applyRemote([remoteEntry({ id: 'gone' })]);

    const removedIds: string[] = [];
    remote.pullResponse = {
      ok: true,
      value: {
        entries: [
          remoteEntry({
            id: 'gone',
            deletedAt: '2026-09-02T00:00:00.000Z',
            updatedAt: '2026-09-02T00:00:00.000Z',
          }),
        ],
        watermark: '2026-09-02T00:00:00.000Z',
      },
    };

    await syncEntries(remote, {
      onRemoved: async (ids) => {
        removedIds.push(...ids);
      },
    });

    expect(removedIds).toEqual(['gone']);
    expect(await allEntries()).toEqual([]);
  });

  // The bug this guards against: filtering tombstones out of a pull, so the
  // entry comes back on the next sync and will not stay deleted.
  it('does not resurrect an entry deleted elsewhere', async () => {
    await applyRemote([remoteEntry({ id: 'gone' })]);
    remote.pullResponse = {
      ok: true,
      value: {
        entries: [
          remoteEntry({
            id: 'gone',
            deletedAt: '2026-09-02T00:00:00.000Z',
            updatedAt: '2026-09-02T00:00:00.000Z',
          }),
        ],
        watermark: '2026-09-02T00:00:00.000Z',
      },
    };

    await syncEntries(remote);
    __testing.reset();
    await syncEntries(remote);

    expect(await listEntries()).toEqual([]);
  });
});

describe('the watermark', () => {
  it('starts empty and advances to the newest row seen', async () => {
    remote.pullResponse = {
      ok: true,
      value: { entries: [remoteEntry()], watermark: '2026-09-05T00:00:00.000Z' },
    };

    await syncEntries(remote);

    expect(remote.pullSince[0]).toBeNull();
    expect(await readWatermark()).toEqual('2026-09-05T00:00:00.000Z');
  });

  it('asks from where it left off next time', async () => {
    remote.pullResponse = {
      ok: true,
      value: { entries: [remoteEntry()], watermark: '2026-09-05T00:00:00.000Z' },
    };
    await syncEntries(remote);

    __testing.reset();
    await syncEntries(remote);

    expect(remote.pullSince[1]).toEqual('2026-09-05T00:00:00.000Z');
  });

  // Saving it before the rows have landed would skip them forever.
  it('is not advanced by a failed pull', async () => {
    remote.pullResponse = { ok: false, error: failure };

    const report = await syncEntries(remote);

    expect(report.status).toEqual('failed');
    expect(await readWatermark()).toBeNull();
  });

  it('is cleared on sign out, so the next person does not inherit it', async () => {
    remote.pullResponse = {
      ok: true,
      value: { entries: [remoteEntry()], watermark: '2026-09-05T00:00:00.000Z' },
    };
    await syncEntries(remote);

    await resetSyncState();

    expect(await readWatermark()).toBeNull();
  });
});

describe('two passes at once', () => {
  // Foregrounding the app mid-sync is ordinary. Without the guard the same
  // entries are pushed twice and the watermark can be written backwards.
  it('refuses to start a second pass while one is running', async () => {
    await createEntry(draft);

    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    remote.pushResponse = () => {
      throw new Error('unused');
    };
    remote.push = async (entries) => {
      remote.pushed.push(entries);
      await held;
      return {
        ok: true,
        value: { accepted: entries.map((e) => ({ ...e, unsynced: false })), deleted: [] },
      };
    };

    const first = syncEntries(remote);
    const second = await syncEntries(remote);

    expect(second.status).toEqual('busy');
    expect(second.pushed).toEqual(0);

    release?.();
    expect((await first).status).toEqual('ok');
    expect(remote.pushed).toHaveLength(1);
  });
});
