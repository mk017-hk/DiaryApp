import { createTestUser, deleteTestUser, type TestUser } from './helpers';

/**
 * The sync contract, against the real database.
 *
 * The conflict logic is tested against a fake in `src/features/entries`, which
 * is where the awkward orderings are written down. This is the other half: the
 * SQL that logic assumes — that a client may date its own edit, that an older
 * edit cannot overwrite a newer one however late it arrives, and that a
 * deletion is something a second device can actually find out about.
 *
 * Requires the local stack: npx supabase start
 */

jest.setTimeout(60_000);

let alice: TestUser;
let bob: TestUser;

/**
 * Two devices, one account.
 *
 * Both hold a real session for the same user, which is exactly what a phone
 * and a tablet are. Distinct clients matter: a shared one would hide any bug
 * that depends on a device not having seen something yet.
 */
let phone: TestUser;
let tablet: TestUser;

beforeAll(async () => {
  alice = await createTestUser('alice');
  bob = await createTestUser('bob');
  phone = alice;
  // The tablet signs in as Alice too, through its own client.
  tablet = await signInAgain(alice);
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(bob);
});

/** A second signed-in client for the same person, as a second device would be. */
async function signInAgain(user: TestUser): Promise<TestUser> {
  const { createClient } = await import('@supabase/supabase-js');
  const { localStack } = await import('./helpers');
  const { apiUrl, anonKey } = localStack();

  const client = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await client.auth.signInWithPassword({
    email: user.user.email ?? '',
    password: 'test-password-9f3b2a',
  });
  if (error !== null) throw error;

  return { user: user.user, client, diaryId: user.diaryId };
}

/** What the app's repository sends: the whole row, timestamps included. */
const row = (device: TestUser, over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  diary_id: device.diaryId,
  author_id: device.user.id,
  body: 'Something I wrote.',
  entry_date: '2026-09-01',
  entry_at: '2026-09-01T09:00:00.000Z',
  mood: 3,
  is_favourite: false,
  deleted_at: null,
  created_at: '2026-09-01T09:00:00.000Z',
  updated_at: '2026-09-01T09:00:00.000Z',
  ...over,
});

const push = (device: TestUser, rows: Record<string, unknown>[]) =>
  device.client.from('journal_entries').upsert(rows, { onConflict: 'id' }).select('*');

const pull = (device: TestUser, since: string | null) => {
  let query = device.client
    .from('journal_entries')
    .select('*')
    .eq('diary_id', device.diaryId)
    .order('updated_at', { ascending: true });

  if (since !== null) query = query.gte('updated_at', since);
  return query;
};

describe('the done criterion: written in flight mode, read on another device', () => {
  it('carries an entry written hours ago, offline, to a second device', async () => {
    // Written at 07:00 on a plane. The phone had no signal, so the row is
    // pushed now but dated then — which is the whole point of sending
    // updated_at rather than letting the server stamp arrival time.
    const written = '2026-09-01T07:00:00.000Z';
    const entry = row(phone, {
      body: 'Somewhere over the Atlantic, and I could not stop thinking about it.',
      updated_at: written,
      created_at: written,
      entry_at: written,
    });

    const { error } = await push(phone, [entry]);
    expect(error).toBeNull();

    // The tablet, which has never seen it, syncs from nothing.
    const { data, error: pullError } = await pull(tablet, null);

    expect(pullError).toBeNull();
    const found = (data ?? []).find((r) => r.id === entry.id);
    expect(found?.body).toEqual(
      'Somewhere over the Atlantic, and I could not stop thinking about it.',
    );
    // And it kept the time it was actually written.
    expect(new Date(found?.updated_at as string).toISOString()).toEqual(written);
  });
});

describe('an edit that arrives late', () => {
  it('does not overwrite a newer one', async () => {
    const entry = row(phone, { body: 'first', updated_at: '2026-09-02T10:00:00.000Z' });
    await push(phone, [entry]);

    // The tablet edits at noon and syncs straight away.
    await push(tablet, [
      { ...entry, body: 'tablet, at noon', updated_at: '2026-09-02T12:00:00.000Z' },
    ]);

    // The phone finally reconnects and pushes its 11:00 edit.
    const { data } = await push(phone, [
      { ...entry, body: 'phone, at eleven', updated_at: '2026-09-02T11:00:00.000Z' },
    ]);

    expect(data?.[0]?.body).toEqual('tablet, at noon');
  });

  // The losing device has to find out, or it will keep the wrong text and keep
  // trying to send it. The upsert hands back the winner in the same round trip.
  it('hands the winning row back to the device that lost', async () => {
    const entry = row(phone, { body: 'original', updated_at: '2026-09-03T10:00:00.000Z' });
    await push(phone, [entry]);
    await push(tablet, [{ ...entry, body: 'the winner', updated_at: '2026-09-03T12:00:00.000Z' }]);

    const { data } = await push(phone, [
      { ...entry, body: 'the loser', updated_at: '2026-09-03T09:00:00.000Z' },
    ]);

    expect(data?.[0]?.body).toEqual('the winner');
    expect(new Date(data?.[0]?.updated_at as string).toISOString()).toEqual(
      '2026-09-03T12:00:00.000Z',
    );
  });

  it('accepts an edit that is genuinely newer', async () => {
    const entry = row(phone, { body: 'before', updated_at: '2026-09-04T10:00:00.000Z' });
    await push(phone, [entry]);

    const { data } = await push(phone, [
      { ...entry, body: 'after', updated_at: '2026-09-04T11:00:00.000Z' },
    ]);

    expect(data?.[0]?.body).toEqual('after');
  });
});

describe('deleting, so it stays deleted', () => {
  it('lets a second device find out that something was deleted', async () => {
    const entry = row(phone, { updated_at: '2026-09-05T10:00:00.000Z' });
    await push(phone, [entry]);

    const deletedAt = '2026-09-05T11:00:00.000Z';
    await push(phone, [{ ...entry, deleted_at: deletedAt, updated_at: deletedAt }]);

    const { data } = await pull(tablet, '2026-09-05T10:30:00.000Z');
    const found = (data ?? []).find((r) => r.id === entry.id);

    expect(found).toBeDefined();
    expect(found?.deleted_at).not.toBeNull();
  });

  // Created and deleted while offline: the server has never seen this row, so
  // the tombstone has to arrive as an insert rather than an update.
  it('accepts a tombstone for a row the server never had', async () => {
    const deletedAt = '2026-09-06T11:00:00.000Z';
    const entry = row(phone, { deleted_at: deletedAt, updated_at: deletedAt });

    const { data, error } = await push(phone, [entry]);

    expect(error).toBeNull();
    expect(data?.[0]?.deleted_at).not.toBeNull();
  });
});

describe('pulling only what changed', () => {
  it('returns nothing when nothing has moved', async () => {
    const entry = row(phone, { updated_at: '2026-09-07T10:00:00.000Z' });
    await push(phone, [entry]);

    const { data: first } = await pull(tablet, null);
    const watermark = first?.[first.length - 1]?.updated_at as string;

    // The bound is inclusive on purpose, so the row that set the watermark
    // comes back and nothing written in the same millisecond is skipped.
    const { data: second } = await pull(tablet, watermark);

    expect((second ?? []).length).toBeLessThanOrEqual(1);
    expect((second ?? []).every((r) => r.updated_at >= watermark)).toBe(true);
  });

  it('returns a row edited after the watermark', async () => {
    const { data: before } = await pull(tablet, null);
    const watermark = before?.[before.length - 1]?.updated_at as string;

    const entry = row(phone, {
      body: 'after the watermark',
      updated_at: '2099-01-01T00:00:00.000Z',
    });
    await push(phone, [entry]);

    const { data } = await pull(tablet, watermark);

    expect((data ?? []).some((r) => r.id === entry.id)).toBe(true);
  });
});

describe('another account cannot join in', () => {
  it('cannot pull from a diary it is not a member of', async () => {
    const { data } = await pull({ ...bob, diaryId: alice.diaryId }, null);
    expect(data ?? []).toEqual([]);
  });

  // The interesting one: a forged push. An id is guessable, so the check that
  // matters is the diary, and it is a policy rather than anything the client
  // could be trusted to enforce.
  it('cannot push into a diary it is not a member of', async () => {
    const { error } = await push(bob, [
      row(bob, { diary_id: alice.diaryId, body: 'planted by someone else' }),
    ]);

    expect(error).not.toBeNull();
  });

  it('cannot revive or alter an entry in another diary by upserting its id', async () => {
    const entry = row(phone, { body: 'alice wrote this', updated_at: '2099-06-01T00:00:00.000Z' });
    await push(phone, [entry]);

    await push(bob, [
      { ...entry, diary_id: bob.diaryId, author_id: bob.user.id, body: 'overwritten' },
    ]);

    const { data } = await phone.client
      .from('journal_entries')
      .select('body')
      .eq('id', entry.id)
      .single();

    expect(data?.body).toEqual('alice wrote this');
  });
});
