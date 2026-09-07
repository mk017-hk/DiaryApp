import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  allEntries,
  applyRemote,
  createEntry,
  deleteEntry,
  listEntries,
  type Entry,
} from '../entryStore';
import {
  __testing,
  syncEntries,
  type PullOutcome,
  type PushOutcome,
  type RemoteResult,
  type SyncRemote,
  type UploadedMedia,
} from '../sync';

/**
 * Getting a recording off one phone and onto another.
 *
 * The upload itself needs a device, so what is tested here is the part that
 * decides *when* to upload, what to do when it fails, and how a phone that
 * never held the file learns where to find it.
 */

jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: () => `id-${String(++counter)}` };
});

const failure = { kind: 'network', userMessage: 'offline' } as never;

class FakeRemote implements SyncRemote {
  uploads: string[] = [];
  uploadResponse: ((entry: Entry) => RemoteResult<UploadedMedia>) | null = null;
  pullResponse: RemoteResult<PullOutcome> = { ok: true, value: { entries: [], watermark: null } };

  async push(entries: Entry[]): Promise<RemoteResult<PushOutcome>> {
    const accepted = entries.map((entry) => ({ ...entry, unsynced: false }));
    return {
      ok: true,
      value: {
        accepted,
        deleted: accepted.filter((e) => e.deletedAt !== undefined).map((e) => e.id),
      },
    };
  }

  async pull(): Promise<RemoteResult<PullOutcome>> {
    return this.pullResponse;
  }

  async uploadMedia(entry: Entry): Promise<RemoteResult<UploadedMedia>> {
    this.uploads.push(entry.id);
    if (this.uploadResponse !== null) return this.uploadResponse(entry);
    return {
      ok: true,
      value: {
        storagePath: `diary/${entry.id}/clip.mov`,
        posterPath: `diary/${entry.id}/still.jpg`,
      },
    };
  }
}

const videoDraft = {
  entryDate: '2026-09-01',
  entryAt: '2026-09-01T09:00:00.000Z',
  body: 'Said out loud, to a camera.',
  mood: 3,
  emotions: [],
  isFavourite: false,
  videoUri: 'file:///documents/videos/clip.mov',
  posterUri: 'file:///documents/posters/clip.jpg',
};

let remote: FakeRemote;

beforeEach(async () => {
  await AsyncStorage.clear();
  __testing.reset();
  remote = new FakeRemote();
});

describe('sending a recording', () => {
  it('uploads a recording that is still only on this phone', async () => {
    const entry = await createEntry(videoDraft);

    const report = await syncEntries(remote);

    expect(remote.uploads).toEqual([entry.id]);
    expect(report.uploaded).toEqual(1);
  });

  it('records where it ended up, so it is not sent twice', async () => {
    const entry = await createEntry(videoDraft);
    await syncEntries(remote);

    const stored = (await listEntries())[0];
    expect(stored?.remoteVideoPath).toEqual(`diary/${entry.id}/clip.mov`);
    expect(stored?.remotePosterPath).toEqual(`diary/${entry.id}/still.jpg`);

    __testing.reset();
    await syncEntries(remote);

    expect(remote.uploads).toEqual([entry.id]);
  });

  it('ignores entries with nothing to upload', async () => {
    const { videoUri: _v, posterUri: _p, ...textOnly } = videoDraft;
    await createEntry(textOnly);

    await syncEntries(remote);

    expect(remote.uploads).toEqual([]);
  });

  // Recording where the media lives must not look like an edit. It changes
  // nothing the server holds, and bumping the timestamp would push a no-op
  // that could beat a real edit made on another device.
  it('does not queue another push just for having uploaded', async () => {
    await createEntry(videoDraft);
    await syncEntries(remote);

    const stored = (await allEntries())[0];
    expect(stored?.unsynced).toBe(false);
  });

  it('leaves the recording queued when the upload fails', async () => {
    await createEntry(videoDraft);
    remote.uploadResponse = () => ({ ok: false, error: failure });

    const report = await syncEntries(remote);

    expect(report.uploaded).toEqual(0);
    expect((await listEntries())[0]?.remoteVideoPath).toBeUndefined();
  });

  // A hundred megabytes over a mobile connection: three at once is three
  // timeouts rather than one success, and whatever stopped the first will
  // almost certainly stop the second.
  it('stops after the first failure rather than grinding through the rest', async () => {
    await createEntry(videoDraft);
    await createEntry(videoDraft);
    await createEntry(videoDraft);
    remote.uploadResponse = () => ({ ok: false, error: failure });

    await syncEntries(remote);

    expect(remote.uploads).toHaveLength(1);
  });

  it('picks up where it left off on the next pass', async () => {
    await createEntry(videoDraft);
    await createEntry(videoDraft);

    remote.uploadResponse = () => ({ ok: false, error: failure });
    await syncEntries(remote);

    remote.uploadResponse = null;
    __testing.reset();
    const report = await syncEntries(remote);

    expect(report.uploaded).toEqual(2);
  });

  it('does not try to upload a recording for a deleted entry', async () => {
    const entry = await createEntry(videoDraft);
    await syncEntries(remote);

    remote.uploads = [];
    await deleteEntry(entry.id);

    __testing.reset();
    await syncEntries(remote);

    expect(remote.uploads).toEqual([]);
  });
});

describe('a device that never held the file', () => {
  // This is how a second phone plays a video it did not record: no local file,
  // but a path it can mint a signed URL from.
  it('learns where the recording lives from a pull', async () => {
    remote.pullResponse = {
      ok: true,
      value: {
        entries: [
          {
            id: 'from-elsewhere',
            entryDate: '2026-09-01',
            entryAt: '2026-09-01T10:00:00.000Z',
            body: 'Recorded on the other phone.',
            mood: null,
            emotions: [],
            isFavourite: false,
            createdAt: '2026-09-01T10:00:00.000Z',
            updatedAt: '2026-09-01T10:00:00.000Z',
            remoteVideoPath: 'diary/from-elsewhere/clip.mov',
            remotePosterPath: 'diary/from-elsewhere/still.jpg',
            unsynced: false,
          },
        ],
        watermark: '2026-09-01T10:00:00.000Z',
      },
    };

    await syncEntries(remote);

    const stored = (await listEntries())[0];
    expect(stored?.videoUri).toBeUndefined();
    expect(stored?.remoteVideoPath).toEqual('diary/from-elsewhere/clip.mov');
  });

  it('does not then try to upload a file it does not have', async () => {
    remote.pullResponse = {
      ok: true,
      value: {
        entries: [
          {
            id: 'from-elsewhere',
            entryDate: '2026-09-01',
            entryAt: '2026-09-01T10:00:00.000Z',
            body: 'Recorded on the other phone.',
            mood: null,
            emotions: [],
            isFavourite: false,
            createdAt: '2026-09-01T10:00:00.000Z',
            updatedAt: '2026-09-01T10:00:00.000Z',
            remoteVideoPath: 'diary/from-elsewhere/clip.mov',
            unsynced: false,
          },
        ],
        watermark: '2026-09-01T10:00:00.000Z',
      },
    };

    await syncEntries(remote);

    expect(remote.uploads).toEqual([]);
  });

  // The phone that recorded it keeps using its own file. Streaming back
  // something already on the disk costs the user data twice.
  it('keeps the local file alongside the remote path', async () => {
    const entry = await createEntry(videoDraft);
    await syncEntries(remote);

    await applyRemote([
      {
        ...entry,
        body: 'Edited on the other phone.',
        updatedAt: '2099-01-01T00:00:00.000Z',
        remoteVideoPath: `diary/${entry.id}/clip.mov`,
        unsynced: false,
      },
    ]);

    const stored = (await listEntries())[0];
    expect(stored?.videoUri).toEqual('file:///documents/videos/clip.mov');
    expect(stored?.remoteVideoPath).toEqual(`diary/${entry.id}/clip.mov`);
  });
});
