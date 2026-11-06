import {
  adminClient,
  createEntry,
  createTestUser,
  createThread,
  deleteTestUser,
  localStack,
  type TestUser,
} from './helpers';

/**
 * Reflections, against the real database and the real function.
 *
 * Two halves. What the assistant may read for one entry — the same exclusions
 * as the daily question, plus one: only the entry's author can ask. And who
 * may see the result: the author, and nobody else, even in a shared diary.
 *
 * The function is exercised up to the line where it would call a model. The
 * local stack has no model key, so a request that passes every rule ends in
 * `no_model_configured` — which is exactly the proof that it passed them.
 *
 * Requires the local stack and the functions: npx supabase functions serve
 */

jest.setTimeout(90_000);

let alice: TestUser;
let bob: TestUser;

const endpoint = () => `${localStack().apiUrl}/functions/v1/reflect`;

const tokenFor = async (user: TestUser) =>
  (await user.client.auth.getSession()).data.session?.access_token ?? '';

const reflect = async (user: TestUser | null, body: unknown) => {
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      apikey: localStack().anonKey,
      'Content-Type': 'application/json',
      ...(user === null ? {} : { Authorization: `Bearer ${await tokenFor(user)}` }),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

const consent = (user: TestUser, enabled: boolean) =>
  user.client.rpc('set_assistant_consent', { enabled });

const source = (user: TestUser, entryId: string) =>
  user.client.rpc('reflection_source', { target: entryId });

/** What only the function can do: write a reflection, as the service role. */
const writeReflection = (user: TestUser, entryId: string) =>
  adminClient()
    .from('entry_reflections')
    .insert({
      entry_id: entryId,
      diary_id: user.diaryId,
      user_id: user.user.id,
      notes: 'You talked about the walk home.',
      model: 'test',
    })
    .select('id')
    .single();

beforeAll(async () => {
  const probe = await fetch(endpoint(), { method: 'OPTIONS' }).catch(() => null);
  if (probe === null || probe.status === 503) {
    throw new Error('The reflect function is not being served. Run: npx supabase functions serve');
  }
  alice = await createTestUser('alice-reflect');
  bob = await createTestUser('bob-reflect');
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(bob);
});

beforeEach(async () => {
  await adminClient().from('journal_entries').delete().eq('diary_id', alice.diaryId);
  await adminClient()
    .from('diary_members')
    .delete()
    .eq('diary_id', alice.diaryId)
    .eq('user_id', bob.user.id);
  await consent(alice, true);
});

describe('what may be read', () => {
  it('returns the entry, with what was said in its recordings', async () => {
    const id = await createEntry(alice, { body: 'The walk home helped.' });
    const { error: mediaError } = await adminClient()
      .from('entry_media')
      .insert({
        entry_id: id,
        diary_id: alice.diaryId,
        kind: 'video',
        storage_path: `${alice.diaryId}/${id}/v.mov`,
        mime_type: 'video/quicktime',
        status: 'uploaded',
        transcript: 'I said this out loud.',
        transcript_status: 'done',
      });
    expect(mediaError).toBeNull();

    const { data } = await source(alice, id);
    expect(data).toEqual([
      expect.objectContaining({
        body: 'The walk home helped.',
        transcript: 'I said this out loud.',
      }),
    ]);
  });

  it('returns nothing without consent', async () => {
    const id = await createEntry(alice);
    await consent(alice, false);
    expect((await source(alice, id)).data).toEqual([]);
  });

  it.each([
    ['held back from the assistant', { ai_excluded: true }],
    ['kept just for her', { is_personal: true }],
    ['deleted', { deleted_at: new Date().toISOString() }],
  ])('returns nothing for an entry %s', async (_label, fields) => {
    const id = await createEntry(alice, fields);
    expect((await source(alice, id)).data).toEqual([]);
  });

  it('returns nothing for an entry in a private thread', async () => {
    const thread = await createThread(alice, true);
    const id = await createEntry(alice, { thread_id: thread });
    expect((await source(alice, id)).data).toEqual([]);
  });

  it('returns nothing to someone she shares the diary with, who can read the entry itself', async () => {
    const { data: code } = await alice.client.rpc('create_diary_invite', {
      target_diary: alice.diaryId,
    });
    await bob.client.rpc('accept_diary_invite', { code });
    await consent(bob, true);
    const id = await createEntry(alice);

    const { data: readable } = await bob.client.from('journal_entries').select('id').eq('id', id);
    expect(readable).toHaveLength(1);
    expect((await source(bob, id)).data).toEqual([]);
  });
});

describe('who may see a reflection', () => {
  it('lets her read and delete her own', async () => {
    const id = await createEntry(alice);
    await writeReflection(alice, id);

    expect((await alice.client.from('entry_reflections').select('notes')).data).toEqual([
      { notes: 'You talked about the walk home.' },
    ]);
    await alice.client.from('entry_reflections').delete().eq('entry_id', id);
    expect((await alice.client.from('entry_reflections').select('id')).data).toEqual([]);
  });

  it('shows nothing to anyone else, even in a shared diary', async () => {
    const { data: code } = await alice.client.rpc('create_diary_invite', {
      target_diary: alice.diaryId,
    });
    await bob.client.rpc('accept_diary_invite', { code });
    const id = await createEntry(alice);
    await writeReflection(alice, id);

    expect((await bob.client.from('entry_reflections').select('id')).data).toEqual([]);
  });

  it('cannot be written by a client, so nothing can be forged in the assistant’s name', async () => {
    const id = await createEntry(alice);
    const { error } = await alice.client.from('entry_reflections').insert({
      entry_id: id,
      diary_id: alice.diaryId,
      user_id: alice.user.id,
      notes: 'forged',
      model: 'me',
    });
    expect(error).not.toBeNull();
  });

  // Timestamps made when the test runs, after the entry exists — one made when
  // this file loads would be older than the entry, and correctly ignored as a
  // stale edit.
  it.each([
    [
      'deleted',
      () => ({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    ],
    ['held back from the assistant afterwards', () => ({ ai_excluded: true })],
  ])('goes when its entry is %s', async (_label, change) => {
    const id = await createEntry(alice);
    await writeReflection(alice, id);
    const { error } = await alice.client.from('journal_entries').update(change()).eq('id', id);
    expect(error).toBeNull();
    const { data } = await adminClient().from('entry_reflections').select('id').eq('entry_id', id);
    expect(data).toEqual([]);
  });
});

describe('the function', () => {
  it('turns away a request with no session', async () => {
    expect((await reflect(null, { entry_id: crypto.randomUUID() })).status).toBe(401);
  });

  it('turns away a request that is not about an entry', async () => {
    expect((await reflect(alice, { entry_id: 'not-an-id' })).status).toBe(400);
  });

  it('says it is not allowed, rather than why, for an entry it may not read', async () => {
    const id = await createEntry(alice, { ai_excluded: true });
    expect((await reflect(alice, { entry_id: id })).body).toEqual({
      outcome: 'unavailable',
      reason: 'not_allowed',
    });
  });

  it('will not read somebody else’s entry for them', async () => {
    const id = await createEntry(alice);
    await consent(bob, true);
    expect((await reflect(bob, { entry_id: id })).body).toMatchObject({ reason: 'not_allowed' });
  });

  it('has nothing to say about an entry with no words in it', async () => {
    const id = await createEntry(alice, { body: '' });
    expect((await reflect(alice, { entry_id: id })).body).toMatchObject({
      reason: 'nothing_to_read',
    });
  });

  it('passes every rule and stops where the model would be called', async () => {
    const id = await createEntry(alice, { body: 'The walk home helped.' });
    expect((await reflect(alice, { entry_id: id })).body).toEqual({
      outcome: 'unavailable',
      reason: 'no_model_configured',
    });
  });

  it('hands back a reflection it already has instead of paying for another', async () => {
    const id = await createEntry(alice, { body: 'The walk home helped.' });
    await writeReflection(alice, id);
    const result = await reflect(alice, { entry_id: id });
    expect(result.body).toMatchObject({
      outcome: 'reflection',
      reflection: expect.objectContaining({ notes: 'You talked about the walk home.' }),
    });
  });
});
