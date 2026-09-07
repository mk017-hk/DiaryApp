import type { Entry } from '@/features/entries/entryStore';

import { fromRow, toRow, type SyncContext } from '../entries';

/**
 * The row mapping, which is pure and therefore worth pinning down here rather
 * than through a database.
 */

const context: SyncContext = {
  diaryId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
};

const entry: Entry = {
  id: '33333333-3333-4333-8333-333333333333',
  entryDate: '2026-09-01',
  entryAt: '2026-09-01T09:00:00.000Z',
  body: 'The kitchen light was still on when I got home.',
  mood: 4,
  emotions: [],
  isFavourite: true,
  videoUri: 'file:///documents/videos/clip.mov',
  posterUri: 'file:///documents/posters/clip.jpg',
  transcript: 'What I actually said out loud.',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:30:00.000Z',
  unsynced: true,
};

describe('sending an entry', () => {
  it('carries the time the edit was made, not the time it is being sent', () => {
    expect(toRow(entry, context).updated_at).toEqual('2026-09-01T09:30:00.000Z');
  });

  it('stamps the diary and author from the session, never from the entry', () => {
    const row = toRow(entry, context);

    expect(row.diary_id).toEqual(context.diaryId);
    expect(row.author_id).toEqual(context.userId);
  });

  // These are paths to files on one particular phone. Sending them would put
  // one device's filesystem into another device's diary.
  it('never sends local file paths', () => {
    const serialised = JSON.stringify(toRow(entry, context));

    expect(serialised).not.toContain('file://');
    expect(serialised).not.toContain('videoUri');
    expect(serialised).not.toContain('posterUri');
  });

  // PostgREST only updates the columns present, so leaving these out preserves
  // whatever set them. Sending nulls would erase a thread on every sync.
  it('omits columns this app does not own', () => {
    const row = toRow(entry, context) as Record<string, unknown>;

    expect(row).not.toHaveProperty('thread_id');
    expect(row).not.toHaveProperty('title');
    expect(row).not.toHaveProperty('people');
  });

  it('sends a tombstone as a deleted_at rather than as an absence', () => {
    expect(toRow({ ...entry, deletedAt: '2026-09-02T00:00:00.000Z' }, context).deleted_at).toEqual(
      '2026-09-02T00:00:00.000Z',
    );
    expect(toRow(entry, context).deleted_at).toBeNull();
  });
});

describe('reading a row back', () => {
  const row = toRow(entry, context);

  it('round-trips everything the server owns', () => {
    const returned = fromRow({ ...row, body: 'Edited elsewhere.' });

    expect(returned.id).toEqual(entry.id);
    expect(returned.body).toEqual('Edited elsewhere.');
    expect(returned.entryDate).toEqual(entry.entryDate);
    expect(returned.mood).toEqual(entry.mood);
    expect(returned.isFavourite).toEqual(entry.isFavourite);
    expect(returned.updatedAt).toEqual(entry.updatedAt);
  });

  it('comes back settled, not queued for another push', () => {
    expect(fromRow(row).unsynced).toBe(false);
  });

  it('turns a null body into an empty string, so screens never render "null"', () => {
    expect(fromRow({ ...row, body: null }).body).toEqual('');
  });

  it('leaves deletedAt off entirely when the row is alive', () => {
    expect(fromRow({ ...row, deleted_at: null }).deletedAt).toBeUndefined();
  });

  it('reports a tombstone as deleted', () => {
    expect(fromRow({ ...row, deleted_at: '2026-09-02T00:00:00.000Z' }).deletedAt).toEqual(
      '2026-09-02T00:00:00.000Z',
    );
  });

  // The store merges these back from the local row. If the mapper invented
  // them the merge would have nothing to distinguish "no media" from "media
  // this device has not downloaded".
  it('carries no media pointers of its own', () => {
    const returned = fromRow(row);

    expect(returned.videoUri).toBeUndefined();
    expect(returned.posterUri).toBeUndefined();
  });
});
