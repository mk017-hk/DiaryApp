import {
  createEntry,
  createTestUser,
  createThread,
  deleteTestUser,
  signUpTestUser,
  type TestUser,
} from './helpers';

/**
 * Two-user isolation suite.
 *
 * This is the test that matters most in the whole project. Someone will record
 * a video diary about a miscarriage; nobody else may ever reach it. Every case
 * below is an attempt by user B to touch user A's data using nothing but ids
 * they might have guessed or scraped — the IDOR and broken-access-control
 * shapes that actually cause breaches.
 *
 * Requires the local stack: npx supabase start
 */

jest.setTimeout(60_000);

let alice: TestUser;
let mallory: TestUser;
let aliceEntryId: string;
let aliceThreadId: string;

beforeAll(async () => {
  alice = await createTestUser('alice');
  mallory = await createTestUser('mallory');
  aliceThreadId = await createThread(alice);
  aliceEntryId = await createEntry(alice, { thread_id: aliceThreadId });
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(mallory);
});

describe('signup wiring', () => {
  it('gives each new user their own personal diary', () => {
    expect(alice.diaryId).toBeTruthy();
    expect(mallory.diaryId).toBeTruthy();
    expect(alice.diaryId).not.toEqual(mallory.diaryId);
  });

  it('creates a profile row for each user', async () => {
    const { data } = await alice.client.from('profiles').select('id').eq('id', alice.user.id);
    expect(data).toHaveLength(1);
  });
});

describe('a user can reach their own data (positive control)', () => {
  it('reads their own entry', async () => {
    const { data, error } = await alice.client
      .from('journal_entries')
      .select('id, body')
      .eq('id', aliceEntryId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('updates their own entry', async () => {
    const { error } = await alice.client
      .from('journal_entries')
      .update({ body: 'Edited by me.' })
      .eq('id', aliceEntryId);

    expect(error).toBeNull();
  });
});

describe('journal entries are unreachable across users', () => {
  it('B cannot read A’s entry by id', async () => {
    const { data, error } = await mallory.client
      .from('journal_entries')
      .select('id, body')
      .eq('id', aliceEntryId);

    // RLS filters rather than errors: the row simply does not exist for B.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('B cannot list any of A’s entries', async () => {
    const { data } = await mallory.client.from('journal_entries').select('id');
    expect(data).toEqual([]);
  });

  it('B cannot update A’s entry', async () => {
    const { data } = await mallory.client
      .from('journal_entries')
      .update({ body: 'tampered' })
      .eq('id', aliceEntryId)
      .select('id');

    expect(data ?? []).toEqual([]);

    const { data: after } = await alice.client
      .from('journal_entries')
      .select('body')
      .eq('id', aliceEntryId)
      .single();
    expect(after?.body).not.toEqual('tampered');
  });

  it('B cannot delete A’s entry', async () => {
    const { data } = await mallory.client
      .from('journal_entries')
      .delete()
      .eq('id', aliceEntryId)
      .select('id');

    expect(data ?? []).toEqual([]);

    const { data: survives } = await alice.client
      .from('journal_entries')
      .select('id')
      .eq('id', aliceEntryId);
    expect(survives).toHaveLength(1);
  });

  it('B cannot insert an entry into A’s diary', async () => {
    const { error } = await mallory.client.from('journal_entries').insert({
      diary_id: alice.diaryId,
      author_id: mallory.user.id,
      body: 'planted',
    });

    expect(error).not.toBeNull();
  });

  it('B cannot forge authorship inside their own diary', async () => {
    const { error } = await mallory.client.from('journal_entries').insert({
      diary_id: mallory.diaryId,
      author_id: alice.user.id,
      body: 'attributed to someone else',
    });

    expect(error).not.toBeNull();
  });
});

describe('diaries and membership', () => {
  it('B cannot read A’s diary', async () => {
    const { data } = await mallory.client.from('diaries').select('id').eq('id', alice.diaryId);
    expect(data).toEqual([]);
  });

  // The single most dangerous write in the schema: if B can add themselves to
  // A's diary, every other policy in the file becomes irrelevant.
  it('B cannot add themselves to A’s diary', async () => {
    const { error } = await mallory.client
      .from('diary_members')
      .insert({ diary_id: alice.diaryId, user_id: mallory.user.id, role: 'member' });

    expect(error).not.toBeNull();

    const { data: entries } = await mallory.client.from('journal_entries').select('id');
    expect(entries).toEqual([]);
  });

  it('B cannot see who is in A’s diary', async () => {
    const { data } = await mallory.client
      .from('diary_members')
      .select('user_id')
      .eq('diary_id', alice.diaryId);

    expect(data).toEqual([]);
  });

  // A policy on diary_members that queried diary_members would recurse until
  // the connection died. This asserts the SECURITY DEFINER helper broke it.
  it('querying diary_members returns rather than recursing', async () => {
    const { data, error } = await alice.client.from('diary_members').select('diary_id, role');

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.role).toEqual('owner');
  });
});

describe('threads', () => {
  it('B cannot read A’s thread', async () => {
    const { data } = await mallory.client.from('threads').select('id').eq('id', aliceThreadId);
    expect(data).toEqual([]);
  });

  it('B cannot attach their entry to A’s thread', async () => {
    const { error } = await mallory.client.from('journal_entries').insert({
      diary_id: mallory.diaryId,
      author_id: mallory.user.id,
      thread_id: aliceThreadId,
      body: 'cross-diary thread',
    });

    // Blocked by the composite FK: a thread must live in the same diary.
    expect(error).not.toBeNull();
  });
});

describe('media and transcripts', () => {
  it('B cannot attach media to A’s entry', async () => {
    const { error } = await mallory.client.from('entry_media').insert({
      entry_id: aliceEntryId,
      diary_id: alice.diaryId,
      kind: 'video',
      storage_path: `${alice.diaryId}/${aliceEntryId}/planted.mp4`,
      mime_type: 'video/mp4',
    });

    expect(error).not.toBeNull();
  });

  it('B cannot read A’s transcripts', async () => {
    await alice.client.from('entry_media').insert({
      entry_id: aliceEntryId,
      diary_id: alice.diaryId,
      kind: 'video',
      storage_path: `${alice.diaryId}/${aliceEntryId}/${Date.now()}.mp4`,
      mime_type: 'video/mp4',
      transcript: 'Something I said out loud and never meant to share.',
      transcript_status: 'done',
    });

    const { data } = await mallory.client.from('entry_media').select('transcript');
    expect(data).toEqual([]);
  });
});

describe('profiles', () => {
  it('B cannot read A’s profile', async () => {
    const { data } = await mallory.client.from('profiles').select('id').eq('id', alice.user.id);
    expect(data).toEqual([]);
  });

  it('B cannot flip A’s AI consent', async () => {
    const { data } = await mallory.client
      .from('profiles')
      .update({ ai_enabled: false })
      .eq('id', alice.user.id)
      .select('id');

    expect(data ?? []).toEqual([]);
  });
});

describe('private storage', () => {
  const objectPath = () => `${alice.diaryId}/${aliceEntryId}/secret.txt`;

  beforeAll(async () => {
    const { error } = await alice.client.storage
      .from('entry-media')
      .upload(objectPath(), new Blob(['private video bytes'], { type: 'audio/wav' }), {
        contentType: 'audio/wav',
        upsert: true,
      });
    expect(error).toBeNull();
  });

  it('B cannot download A’s media', async () => {
    const { error } = await mallory.client.storage.from('entry-media').download(objectPath());
    expect(error).not.toBeNull();
  });

  it('B cannot sign a URL for A’s media', async () => {
    const { data, error } = await mallory.client.storage
      .from('entry-media')
      .createSignedUrl(objectPath(), 60);

    expect(data?.signedUrl ?? null).toBeNull();
    expect(error).not.toBeNull();
  });

  it('B cannot list A’s media folder', async () => {
    const { data } = await mallory.client.storage.from('entry-media').list(alice.diaryId);
    expect(data ?? []).toEqual([]);
  });

  it('B cannot upload into A’s diary folder', async () => {
    const { error } = await mallory.client.storage
      .from('entry-media')
      .upload(`${alice.diaryId}/${aliceEntryId}/planted.wav`, new Blob(['x']), {
        contentType: 'audio/wav',
      });

    expect(error).not.toBeNull();
  });

  it('A can sign a URL for their own media', async () => {
    const { data, error } = await alice.client.storage
      .from('entry-media')
      .createSignedUrl(objectPath(), 60);

    expect(error).toBeNull();
    expect(data?.signedUrl).toContain('token=');
  });
});

/**
 * The sign-up screen's own path.
 *
 * Everything above builds its users through the admin API, which no device can
 * reach. These create an account exactly as the app does — anon key,
 * `auth.signUp`, display name in user metadata — and then check that the new
 * session is as boxed in as every other.
 */
describe('signing up the way the app does', () => {
  let newcomer: Awaited<ReturnType<typeof signUpTestUser>>;

  beforeAll(async () => {
    newcomer = await signUpTestUser('nora');
  });

  afterAll(async () => {
    await deleteTestUser(newcomer);
  });

  it('creates a profile carrying the name given at sign-up', async () => {
    const { data, error } = await newcomer.client
      .from('profiles')
      .select('id, display_name')
      .eq('id', newcomer.user.id)
      .single();

    expect(error).toBeNull();
    expect(data?.display_name).toEqual('nora');
  });

  it('creates exactly one personal diary, owned by them', async () => {
    const { data } = await newcomer.client.from('diaries').select('id, kind, owner_id');

    expect(data).toHaveLength(1);
    expect(data?.[0]?.kind).toEqual('personal');
    expect(data?.[0]?.owner_id).toEqual(newcomer.user.id);
  });

  it('makes them the owner member of it', async () => {
    const { data } = await newcomer.client
      .from('diary_members')
      .select('role')
      .eq('diary_id', newcomer.diaryId);

    expect(data).toHaveLength(1);
    expect(data?.[0]?.role).toEqual('owner');
  });

  it('can write and read back an entry straight away', async () => {
    const entryId = await createEntry(newcomer);
    const { data, error } = await newcomer.client
      .from('journal_entries')
      .select('id')
      .eq('id', entryId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  // The point of the whole block: a session minted by the real sign-up path is
  // no more privileged than one built by the harness.
  it('cannot see anything of A’s', async () => {
    const [entries, threads, diaries, profiles] = await Promise.all([
      newcomer.client.from('journal_entries').select('id').eq('id', aliceEntryId),
      newcomer.client.from('threads').select('id').eq('id', aliceThreadId),
      newcomer.client.from('diaries').select('id').eq('id', alice.diaryId),
      newcomer.client.from('profiles').select('id').eq('id', alice.user.id),
    ]);

    expect(entries.data).toEqual([]);
    expect(threads.data).toEqual([]);
    expect(diaries.data).toEqual([]);
    expect(profiles.data).toEqual([]);
  });

  it('cannot write into A’s diary', async () => {
    const { error } = await newcomer.client.from('journal_entries').insert({
      diary_id: alice.diaryId,
      author_id: newcomer.user.id,
      body: 'Planted by a brand new account.',
    });

    expect(error).not.toBeNull();
  });

  // Signing out is the only way back to a locked device on a shared phone. If
  // the session survived it, "sign out" would be a lie.
  it('reaches nothing once signed out', async () => {
    await newcomer.client.auth.signOut();

    const { data } = await newcomer.client.from('journal_entries').select('id');
    expect(data ?? []).toEqual([]);

    // Signed back in, their own diary is still there.
    const { error } = await newcomer.client.auth.signInWithPassword({
      email: newcomer.email,
      password: newcomer.password,
    });
    expect(error).toBeNull();

    const { data: mine } = await newcomer.client.from('journal_entries').select('id');
    expect((mine ?? []).length).toBeGreaterThan(0);
  });
});
