import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  applyRemote,
  audioOf,
  createEntry,
  deleteEntry,
  listEntries,
  mediaNeedingUpload,
  photosOf,
  videoOf,
  type Entry,
} from '../entryStore';

/**
 * Media as a list, which is what `entry_media` always was.
 *
 * The half that matters most here is the migration: a phone sitting on an
 * older build holds entries with a single `videoUri`, and reading them back
 * under the new shape must not quietly lose the video on every one of them.
 */

jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: () => `id-${String(++counter)}` };
});

const draft = {
  entryDate: '2026-09-01',
  entryAt: '2026-09-01T09:00:00.000Z',
  body: 'Something that happened.',
  mood: 3,
  emotions: [],
  media: [],
  isFavourite: false,
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('entries written before media was a list', () => {
  const legacy = {
    id: 'old-1',
    entryDate: '2026-08-01',
    entryAt: '2026-08-01T09:00:00.000Z',
    body: 'Recorded on an older build.',
    mood: 3,
    emotions: [],
    isFavourite: false,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    videoUri: 'file:///documents/videos/old-1.mov',
    posterUri: 'file:///documents/posters/old-1.jpg',
    unsynced: false,
  };

  it('keeps the video rather than dropping it on first read', async () => {
    await AsyncStorage.setItem('entries.v1', JSON.stringify([legacy]));

    const video = videoOf((await listEntries())[0] as Entry);

    expect(video?.uri).toEqual('file:///documents/videos/old-1.mov');
    expect(video?.posterUri).toEqual('file:///documents/posters/old-1.jpg');
  });

  // Keyed on the entry id, which is what the old bucket path used. Any other
  // id would make an already-uploaded video look like it had never been sent,
  // and it would be uploaded a second time under a new name.
  it('keys the migrated item so an uploaded video is not re-sent', async () => {
    await AsyncStorage.setItem(
      'entries.v1',
      JSON.stringify([{ ...legacy, remoteVideoPath: 'diary/old-1/clip.mov' }]),
    );

    const video = videoOf((await listEntries())[0] as Entry);

    expect(video?.id).toEqual('old-1');
    expect(video?.remotePath).toEqual('diary/old-1/clip.mov');
    expect(await mediaNeedingUpload()).toEqual([]);
  });

  it('carries a video that only ever existed in the bucket', async () => {
    const { videoUri: _gone, ...noFile } = legacy;
    await AsyncStorage.setItem(
      'entries.v1',
      JSON.stringify([{ ...noFile, remoteVideoPath: 'diary/old-1/clip.mov' }]),
    );

    expect(videoOf((await listEntries())[0] as Entry)?.remotePath).toEqual('diary/old-1/clip.mov');
  });

  it('leaves an entry that never had media with none', async () => {
    const { videoUri: _v, posterUri: _p, ...textOnly } = legacy;
    await AsyncStorage.setItem('entries.v1', JSON.stringify([textOnly]));

    expect((await listEntries())[0]?.media).toEqual([]);
  });
});

describe('several things on one entry', () => {
  const withEverything = {
    ...draft,
    media: [
      { id: 'v', kind: 'video' as const, uri: 'file:///v.mov' },
      { id: 'p1', kind: 'photo' as const, uri: 'file:///p1.jpg' },
      { id: 'p2', kind: 'photo' as const, uri: 'file:///p2.jpg' },
      { id: 'a', kind: 'audio' as const, uri: 'file:///a.m4a', durationMs: 4000 },
    ],
  };

  it('picks out each kind', async () => {
    const entry = await createEntry(withEverything);

    expect(videoOf(entry)?.id).toEqual('v');
    expect(audioOf(entry)?.id).toEqual('a');
    expect(photosOf(entry).map((item) => item.id)).toEqual(['p1', 'p2']);
  });

  it('queues every file for upload, not just the video', async () => {
    const entry = await createEntry(withEverything);

    const pending = await mediaNeedingUpload();

    expect(pending.map((item) => item.item.id)).toEqual(['v', 'p1', 'p2', 'a']);
    expect(pending.every((item) => item.entryId === entry.id)).toBe(true);
  });

  it('stops queueing one once it has reached the bucket', async () => {
    await createEntry({
      ...draft,
      media: [
        { id: 'sent', kind: 'photo', uri: 'file:///sent.jpg', remotePath: 'diary/e/sent.jpg' },
        { id: 'waiting', kind: 'photo', uri: 'file:///waiting.jpg' },
      ],
    });

    expect((await mediaNeedingUpload()).map((item) => item.item.id)).toEqual(['waiting']);
  });

  it('never queues a file it does not have', async () => {
    await createEntry({
      ...draft,
      media: [{ id: 'elsewhere', kind: 'photo', remotePath: 'diary/e/elsewhere.jpg' }],
    });

    expect(await mediaNeedingUpload()).toEqual([]);
  });

  it('ignores media on a deleted entry', async () => {
    const entry = await createEntry(withEverything);
    await deleteEntry(entry.id);

    expect(await mediaNeedingUpload()).toEqual([]);
  });
});

describe('merging what the server knows with what this phone knows', () => {
  // Both halves carry something the other does not, and taking either side
  // wholesale loses the other.
  it('keeps the local file and takes the remote path', async () => {
    const entry = await createEntry({
      ...draft,
      media: [{ id: 'm', kind: 'video', uri: 'file:///here.mov', posterUri: 'file:///here.jpg' }],
    });

    await applyRemote([
      {
        ...entry,
        updatedAt: '2099-01-01T00:00:00.000Z',
        media: [{ id: 'm', kind: 'video', remotePath: 'diary/e/m.mov' }],
        unsynced: false,
      },
    ]);

    const merged = videoOf((await listEntries())[0] as Entry);
    expect(merged?.uri).toEqual('file:///here.mov');
    expect(merged?.posterUri).toEqual('file:///here.jpg');
    expect(merged?.remotePath).toEqual('diary/e/m.mov');
  });

  it('adds media that only the server has', async () => {
    const entry = await createEntry({
      ...draft,
      media: [{ id: 'mine', kind: 'photo', uri: 'file:///mine.jpg' }],
    });

    await applyRemote([
      {
        ...entry,
        updatedAt: '2099-01-01T00:00:00.000Z',
        media: [
          { id: 'mine', kind: 'photo', remotePath: 'diary/e/mine.jpg' },
          { id: 'theirs', kind: 'photo', remotePath: 'diary/e/theirs.jpg' },
        ],
        unsynced: false,
      },
    ]);

    expect(photosOf((await listEntries())[0] as Entry).map((item) => item.id)).toEqual([
      'mine',
      'theirs',
    ]);
  });

  // The push does not ask for media back, so a row from that path carries
  // none. Treating that as "the server has no media" would wipe a file this
  // device is still holding and about to upload.
  it('does not drop local media when the response carries none', async () => {
    const entry = await createEntry({
      ...draft,
      media: [{ id: 'm', kind: 'photo', uri: 'file:///mine.jpg' }],
    });

    await applyRemote([
      { ...entry, updatedAt: '2099-01-01T00:00:00.000Z', media: [], unsynced: false },
    ]);

    expect((await listEntries())[0]?.media[0]?.uri).toEqual('file:///mine.jpg');
  });
});
