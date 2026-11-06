import AsyncStorage from '@react-native-async-storage/async-storage';

import { fromRow } from '@/services/supabase/entries';

import {
  applyRemote,
  createEntry,
  getEntry,
  markMediaUploaded,
  recordingsToTranscribe,
  setMediaTranscript,
  transcriptOf,
  transcriptsToSend,
  type EntryMedia,
} from '../entryStore';
import { __testing, syncEntries, type SyncRemote } from '../sync';

/**
 * Transcripts on the device, and on their way to the account.
 */

jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: () => `id-${String(++counter)}` };
});

const video = (over: Partial<EntryMedia> = {}): EntryMedia => ({
  id: 'media-video',
  kind: 'video',
  uri: 'file:///clip.mov',
  ...over,
});

const draft = (entryDate: string, media: EntryMedia[]) => ({
  entryDate,
  entryAt: `${entryDate}T09:00:00.000Z`,
  body: '',
  mood: null,
  emotions: [],
  media,
  isFavourite: false,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  __testing.reset();
});

describe('what is waiting to be transcribed', () => {
  it('includes recordings on this phone, newest first, and not photos', async () => {
    await createEntry(draft('2026-11-01', [video({ id: 'old' })]));
    await createEntry(
      draft('2026-11-05', [
        video({ id: 'new' }),
        { id: 'photo', kind: 'photo', uri: 'file:///p.jpg' },
      ]),
    );
    const queue = await recordingsToTranscribe('2026-10-01');
    expect(queue.map((item) => item.item.id)).toEqual(['new', 'old']);
  });

  it('leaves recordings older than the window until they are asked for', async () => {
    const entry = await createEntry(draft('2025-01-01', [video()]));
    expect(await recordingsToTranscribe('2026-10-01')).toEqual([]);

    await setMediaTranscript(entry.id, 'media-video', { status: 'pending' });
    expect(await recordingsToTranscribe('2026-10-01')).toHaveLength(1);
  });

  it('skips a recording this phone only knows as a bucket path', async () => {
    await createEntry(
      draft('2026-11-05', [{ id: 'media-video', kind: 'video', remotePath: 'd/e/x.mov' }]),
    );
    expect(await recordingsToTranscribe('2026-10-01')).toEqual([]);
  });

  it('does not try again after one has been done or has failed', async () => {
    const entry = await createEntry(
      draft('2026-11-05', [
        video({ id: 'a' }),
        video({ id: 'b', kind: 'audio', uri: 'file:///v.m4a' }),
      ]),
    );
    await setMediaTranscript(entry.id, 'a', { status: 'done', transcript: 'hello' });
    await setMediaTranscript(entry.id, 'b', { status: 'failed' });
    expect(await recordingsToTranscribe('2026-10-01')).toEqual([]);
  });
});

describe('recording a transcript', () => {
  it('does not count as an edit, so it cannot beat one made elsewhere', async () => {
    const entry = await createEntry(draft('2026-11-05', [video()]));
    await setMediaTranscript(entry.id, 'media-video', { status: 'done', transcript: 'hello' });
    const after = await getEntry(entry.id);
    expect(after?.updatedAt).toBe(entry.updatedAt);
    expect(transcriptOf(after!)).toBe('hello');
  });

  it('is kept when a pull brings back the same recording without one', async () => {
    const entry = await createEntry(draft('2026-11-05', [video()]));
    await setMediaTranscript(entry.id, 'media-video', { status: 'done', transcript: 'kept' });
    const stored = await getEntry(entry.id);

    await applyRemote([
      {
        ...stored!,
        updatedAt: '2999-01-01T00:00:00.000Z',
        media: [{ id: 'media-video', kind: 'video', remotePath: 'd/e/x.mov' }],
        unsynced: false,
      },
    ]);

    expect((await getEntry(entry.id))?.media[0]).toMatchObject({
      transcript: 'kept',
      remotePath: 'd/e/x.mov',
    });
  });
});

describe('sending transcripts', () => {
  it('waits until the recording has a row in the account', async () => {
    const entry = await createEntry(draft('2026-11-05', [video()]));
    await setMediaTranscript(entry.id, 'media-video', { status: 'done', transcript: 'hello' });
    expect(await transcriptsToSend()).toEqual([]);

    await markMediaUploaded(entry.id, 'media-video', {
      storagePath: 'd/e/x.mov',
      posterPath: null,
    });
    expect(await transcriptsToSend()).toEqual([
      { entryId: entry.id, mediaId: 'media-video', transcript: 'hello', status: 'done' },
    ]);
  });

  it('sends them in a sync pass, once', async () => {
    const entry = await createEntry(draft('2026-11-05', [video({ remotePath: 'd/e/x.mov' })]));
    await setMediaTranscript(entry.id, 'media-video', { status: 'done', transcript: 'hello' });

    const sent: unknown[][] = [];
    const remote: SyncRemote = {
      push: (entries) =>
        Promise.resolve({
          ok: true,
          value: { accepted: entries.map((e) => ({ ...e, unsynced: false })), deleted: [] },
        }),
      pull: () => Promise.resolve({ ok: true, value: { entries: [], watermark: null } }),
      pushTranscripts: (items) => {
        sent.push(items);
        return Promise.resolve({ ok: true, value: items.map((item) => item.mediaId) });
      },
    };

    await syncEntries(remote);
    await syncEntries(remote);

    expect(sent).toEqual([[{ mediaId: 'media-video', transcript: 'hello', status: 'done' }]]);
  });
});

describe('reading them back from the account', () => {
  it('maps a transcript on a media row onto the recording, as already synced', () => {
    const entry = fromRow({
      id: 'e1',
      diary_id: 'd',
      author_id: 'a',
      thread_id: null,
      ai_excluded: false,
      resurface_excluded: false,
      is_personal: false,
      body: '',
      entry_date: '2026-11-05',
      entry_at: '2026-11-05T09:00:00.000Z',
      mood: null,
      is_favourite: false,
      deleted_at: null,
      created_at: '2026-11-05T09:00:00.000Z',
      updated_at: '2026-11-05T09:00:00.000Z',
      entry_media: [
        {
          id: 'm1',
          kind: 'video',
          storage_path: 'd/e/m1.mov',
          poster_path: null,
          duration_ms: null,
          status: 'uploaded',
          position: 0,
          transcript: 'what was said',
          transcript_status: 'done',
        },
      ],
    } as never);
    expect(entry.media[0]).toMatchObject({
      transcript: 'what was said',
      transcriptStatus: 'done',
      transcriptSynced: true,
    });
  });
});
