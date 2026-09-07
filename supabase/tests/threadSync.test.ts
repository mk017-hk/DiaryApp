import { createTestUser, deleteTestUser, type TestUser } from './helpers';

/**
 * Threads: the stories entries belong to.
 *
 * The constraint that matters is the composite foreign key. An entry names a
 * thread by id, and ids are guessable, so the database — not the client —
 * has to be the thing that refuses to let an entry in one diary point at a
 * thread in another. Everything below is that, from both directions.
 *
 * Requires the local stack: npx supabase start
 */

jest.setTimeout(60_000);

let alice: TestUser;
let mallory: TestUser;

beforeAll(async () => {
  alice = await createTestUser('alice');
  mallory = await createTestUser('mallory');
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(mallory);
});

const newThread = (user: TestUser, over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  diary_id: user.diaryId,
  title: 'Trying again',
  description: null,
  status: 'open',
  is_private: false,
  started_on: '2026-09-01',
  created_at: '2026-09-01T09:00:00.000Z',
  updated_at: '2026-09-01T09:00:00.000Z',
  ...over,
});

const push = (user: TestUser, rows: Record<string, unknown>[]) =>
  user.client.from('threads').upsert(rows, { onConflict: 'id' }).select('*');

const entryIn = (user: TestUser, threadId: string | null) => ({
  id: crypto.randomUUID(),
  diary_id: user.diaryId,
  author_id: user.user.id,
  thread_id: threadId,
  body: 'Something that belongs to a story.',
  entry_date: '2026-09-02',
  entry_at: '2026-09-02T09:00:00.000Z',
});

describe('starting and keeping a thread', () => {
  it('round-trips through an upsert, dates and all', async () => {
    const thread = newThread(alice, { title: 'The move' });

    const { data, error } = await push(alice, [thread]);

    expect(error).toBeNull();
    expect(data?.[0]?.title).toEqual('The move');
    expect(data?.[0]?.status).toEqual('open');
  });

  // Threads close rather than disappear, which is why there is no tombstone
  // and no deletion path: a story that ended is still part of the record.
  it('closes without losing anything', async () => {
    const thread = newThread(alice, { title: 'The first year' });
    await push(alice, [thread]);

    const { data } = await push(alice, [
      { ...thread, status: 'closed', updated_at: '2026-10-01T00:00:00.000Z' },
    ]);

    expect(data?.[0]?.status).toEqual('closed');
    expect(data?.[0]?.title).toEqual('The first year');
  });

  it('accepts a start date well before the diary existed', async () => {
    const { error } = await push(alice, [newThread(alice, { started_on: '2019-04-01' })]);

    expect(error).toBeNull();
  });

  it('refuses a thread with no title', async () => {
    const { error } = await push(alice, [newThread(alice, { title: '' })]);

    expect(error).not.toBeNull();
  });
});

describe('putting an entry in a thread', () => {
  it('accepts an entry naming a thread in the same diary', async () => {
    const thread = newThread(alice);
    await push(alice, [thread]);

    const { data, error } = await alice.client
      .from('journal_entries')
      .insert(entryIn(alice, thread.id))
      .select('thread_id')
      .single();

    expect(error).toBeNull();
    expect(data?.thread_id).toEqual(thread.id);
  });

  // The one that matters. Ids are guessable, so this has to be refused by the
  // database rather than by anything the client promises not to do.
  it('refuses an entry naming a thread in somebody else’s diary', async () => {
    const hers = newThread(alice, { title: 'Private to Alice' });
    await push(alice, [hers]);

    const { error } = await mallory.client
      .from('journal_entries')
      .insert(entryIn(mallory, hers.id));

    expect(error).not.toBeNull();
  });

  it('refuses a thread id that does not exist at all', async () => {
    const { error } = await alice.client
      .from('journal_entries')
      .insert(entryIn(alice, crypto.randomUUID()));

    expect(error).not.toBeNull();
  });

  // `on delete set null` on the composite key: losing a thread must not take
  // the entries with it. The writing survives the container.
  it('keeps the entries when a thread is deleted', async () => {
    const thread = newThread(alice, { title: 'Doomed container' });
    await push(alice, [thread]);

    const entry = entryIn(alice, thread.id);
    await alice.client.from('journal_entries').insert(entry);

    await alice.client.from('threads').delete().eq('id', thread.id);

    const { data } = await alice.client
      .from('journal_entries')
      .select('id, thread_id')
      .eq('id', entry.id)
      .single();

    expect(data?.id).toEqual(entry.id);
    expect(data?.thread_id).toBeNull();
  });
});

describe('another account cannot reach them', () => {
  it('cannot read somebody else’s threads', async () => {
    await push(alice, [newThread(alice, { title: 'Only mine' })]);

    const { data } = await mallory.client.from('threads').select('title');

    expect((data ?? []).some((row) => row.title === 'Only mine')).toBe(false);
  });

  it('cannot create one in another diary', async () => {
    const { error } = await push(mallory, [
      newThread(mallory, { diary_id: alice.diaryId, title: 'Planted' }),
    ]);

    expect(error).not.toBeNull();
  });

  it('cannot rename one by upserting its id', async () => {
    const thread = newThread(alice, { title: 'Hers' });
    await push(alice, [thread]);

    await push(mallory, [
      {
        ...thread,
        diary_id: mallory.diaryId,
        title: 'Overwritten',
        updated_at: '2099-01-01T00:00:00.000Z',
      },
    ]);

    const { data } = await alice.client
      .from('threads')
      .select('title')
      .eq('id', thread.id)
      .single();

    expect(data?.title).toEqual('Hers');
  });

  // The privacy flag exists so the assistant can be told to skip a thread
  // entirely. It has to survive a round trip to be worth anything.
  it('keeps a thread marked private', async () => {
    const thread = newThread(alice, { title: 'Not for the assistant', is_private: true });

    const { data } = await push(alice, [thread]);

    expect(data?.[0]?.is_private).toBe(true);
  });
});
