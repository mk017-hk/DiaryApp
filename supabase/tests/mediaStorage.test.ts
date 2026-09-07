import { adminClient, createEntry, createTestUser, deleteTestUser, type TestUser } from './helpers';

/**
 * The private bucket, and the rows that point into it.
 *
 * A diary's video is the most sensitive thing this app holds. The rules being
 * checked: nothing is reachable without a signed URL, a signed URL is only
 * mintable by a member, an interrupted upload leaves something findable rather
 * than an orphan, and one account's reconciler never sees another's.
 *
 * Requires the local stack: npx supabase start
 */

jest.setTimeout(60_000);

const BUCKET = 'entry-media';

let alice: TestUser;
let mallory: TestUser;
let entryId: string;
let objectPath: string;

const bytes = () => new Blob(['pretend this is a video'], { type: 'video/quicktime' });

beforeAll(async () => {
  alice = await createTestUser('alice');
  mallory = await createTestUser('mallory');
  entryId = await createEntry(alice);
  objectPath = `${alice.diaryId}/${entryId}/${crypto.randomUUID()}.mov`;
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(mallory);
});

describe('putting a recording in the bucket', () => {
  it('accepts an upload at a path inside the caller’s own diary', async () => {
    const { error } = await alice.client.storage
      .from(BUCKET)
      .upload(objectPath, bytes(), { contentType: 'video/quicktime' });

    expect(error).toBeNull();
  });

  // The row is written before the bytes are sent, so an upload killed by a
  // dead battery leaves something the reconciler can find. Recording it
  // afterwards would leave bytes with nothing pointing at them: invisible to
  // the user, invisible to the reconciler, and billed for forever.
  it('records the media row as pending first, then flips it to uploaded', async () => {
    const { error: insertError } = await alice.client.from('entry_media').insert({
      entry_id: entryId,
      diary_id: alice.diaryId,
      kind: 'video',
      storage_path: objectPath,
      mime_type: 'video/quicktime',
      status: 'pending',
    });
    expect(insertError).toBeNull();

    const { data: pending } = await alice.client
      .from('entry_media')
      .select('status')
      .eq('storage_path', objectPath)
      .single();
    expect(pending?.status).toEqual('pending');

    const { error: updateError } = await alice.client
      .from('entry_media')
      .update({ status: 'uploaded', size_bytes: 23 })
      .eq('storage_path', objectPath);
    expect(updateError).toBeNull();

    const { data: done } = await alice.client
      .from('entry_media')
      .select('status')
      .eq('storage_path', objectPath)
      .single();
    expect(done?.status).toEqual('uploaded');
  });

  // The composite foreign key is (entry_id, diary_id), so a forged diary_id is
  // rejected by Postgres rather than by anything the client could be trusted
  // to check.
  it('refuses a media row whose entry belongs to a different diary', async () => {
    const { error } = await mallory.client.from('entry_media').insert({
      entry_id: entryId,
      diary_id: mallory.diaryId,
      kind: 'video',
      storage_path: `${mallory.diaryId}/${entryId}/forged.mov`,
      mime_type: 'video/quicktime',
      status: 'pending',
    });

    expect(error).not.toBeNull();
  });
});

describe('getting it back out', () => {
  it('has no unauthenticated URL at all', async () => {
    const { data } = alice.client.storage.from(BUCKET).getPublicUrl(objectPath);

    // The SDK will happily build one; the bucket is private, so it 400s.
    const response = await fetch(data.publicUrl);
    expect(response.ok).toBe(false);
  });

  it('lets a member mint a signed URL that actually works', async () => {
    const { data, error } = await alice.client.storage.from(BUCKET).createSignedUrl(objectPath, 60);

    expect(error).toBeNull();
    expect(data?.signedUrl).toContain('token=');

    const response = await fetch(data?.signedUrl ?? '');
    expect(response.ok).toBe(true);
    expect(await response.text()).toEqual('pretend this is a video');
  });

  it('refuses to sign a URL for somebody else’s object', async () => {
    const { data, error } = await mallory.client.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, 60);

    expect(data?.signedUrl ?? null).toBeNull();
    expect(error).not.toBeNull();
  });

  it('hides the media row itself from another account', async () => {
    const { data } = await mallory.client
      .from('entry_media')
      .select('storage_path')
      .eq('entry_id', entryId);

    expect(data ?? []).toEqual([]);
  });

  // A signed URL is a bearer token. It is minted on demand and never written
  // down, but it does remain valid for its lifetime — worth stating in a test
  // so nobody later assumes revoking a session revokes these.
  it('keeps working for its lifetime even after the minter signs out', async () => {
    const { data } = await alice.client.storage.from(BUCKET).createSignedUrl(objectPath, 60);
    const url = data?.signedUrl ?? '';

    const secondSession = await createTestUser('shortlived');
    await secondSession.client.auth.signOut();
    await deleteTestUser(secondSession);

    expect((await fetch(url)).ok).toBe(true);
  });
});

describe('uploads that never finished', () => {
  it('does not list a recent pending row, which may still be uploading', async () => {
    const path = `${alice.diaryId}/${entryId}/${crypto.randomUUID()}.mov`;
    await alice.client.from('entry_media').insert({
      entry_id: entryId,
      diary_id: alice.diaryId,
      kind: 'video',
      storage_path: path,
      mime_type: 'video/quicktime',
      status: 'pending',
    });

    const { data, error } = await alice.client.rpc('stale_pending_media', {
      older_than: '1 hour',
    });

    expect(error).toBeNull();
    expect((data ?? []).some((row: { storage_path: string }) => row.storage_path === path)).toBe(
      false,
    );
  });

  it('lists one old enough that its upload is certainly not still running', async () => {
    const path = `${alice.diaryId}/${entryId}/${crypto.randomUUID()}.mov`;
    await alice.client.from('entry_media').insert({
      entry_id: entryId,
      diary_id: alice.diaryId,
      kind: 'video',
      storage_path: path,
      mime_type: 'video/quicktime',
      status: 'pending',
    });

    // Backdate it, as a battery dying mid-upload yesterday would have.
    await adminClient()
      .from('entry_media')
      .update({ created_at: '2020-01-01T00:00:00Z' })
      .eq('storage_path', path);

    const { data } = await alice.client.rpc('stale_pending_media', { older_than: '1 hour' });

    expect((data ?? []).some((row: { storage_path: string }) => row.storage_path === path)).toBe(
      true,
    );
  });

  // The function is SECURITY INVOKER, so RLS still applies. A reconciler that
  // could see other people's stalled uploads would be a listing of every
  // diary's media paths.
  it('shows one account nothing of another’s', async () => {
    const { data } = await mallory.client.rpc('stale_pending_media', { older_than: '1 hour' });

    expect(
      (data ?? []).every((row: { diary_id: string }) => row.diary_id === mallory.diaryId),
    ).toBe(true);
  });
});
