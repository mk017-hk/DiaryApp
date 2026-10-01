import { adminClient, createEntry, createTestUser, deleteTestUser, type TestUser } from './helpers';

/**
 * Shared diaries.
 *
 * The most dangerous write in this schema is a row in `diary_members`: anyone
 * who can add themselves to a diary can read everything in it, forever, and
 * nothing else in the design would notice. So these tests spend most of their
 * length on the ways that row could be created by somebody who should not have
 * one, and only then on the feature working.
 *
 * The other half is the part sharing makes necessary rather than possible. Two
 * people keeping a record of something hard still need a page the other cannot
 * read — without it, the only way to keep one difficult entry private is not to
 * write it, which is the outcome this app exists to prevent.
 *
 * Requires the local stack: npx supabase start
 */

jest.setTimeout(90_000);

let alice: TestUser;
let bob: TestUser;
let stranger: TestUser;

const invite = async (owner: TestUser, days?: number) => {
  const { data, error } = await owner.client.rpc('create_diary_invite', {
    target_diary: owner.diaryId,
    ...(days === undefined ? {} : { valid_days: days }),
  });
  if (error !== null) throw error;
  return data as string;
};

const accept = (user: TestUser, code: string) => user.client.rpc('accept_diary_invite', { code });

/** Joins bob to alice's diary the way the app does. */
const share = async () => {
  const code = await invite(alice);
  const { error } = await accept(bob, code);
  if (error !== null) throw error;
};

const unshare = async () => {
  await adminClient()
    .from('diary_members')
    .delete()
    .eq('diary_id', alice.diaryId)
    .eq('user_id', bob.user.id);
};

const bodiesVisibleTo = async (user: TestUser, diaryId: string) => {
  const { data } = await user.client.from('journal_entries').select('body').eq('diary_id', diaryId);
  return (data ?? []).map((row) => row.body);
};

beforeAll(async () => {
  alice = await createTestUser('alice');
  bob = await createTestUser('bob');
  stranger = await createTestUser('stranger');
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(bob);
  await deleteTestUser(stranger);
});

beforeEach(async () => {
  const admin = adminClient();
  await admin.from('journal_entries').delete().eq('diary_id', alice.diaryId);
  await admin.from('threads').delete().eq('diary_id', alice.diaryId);
  await admin.from('diary_invites').delete().eq('diary_id', alice.diaryId);
  await unshare();
});

describe('making an invitation', () => {
  it('gives the owner a code', async () => {
    expect(await invite(alice)).toMatch(/^[A-Z2-9]{12}$/);
  });

  // A table of live invite codes is a table of keys to other people's diaries.
  it('stores a hash, never the code itself', async () => {
    const code = await invite(alice);

    const { data } = await adminClient()
      .from('diary_invites')
      .select('code_hash')
      .eq('diary_id', alice.diaryId);

    expect(data?.[0]?.code_hash).not.toContain(code);
    expect(data?.[0]?.code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives a different code every time', async () => {
    expect(await invite(alice)).not.toEqual(await invite(alice));
  });

  // Leaving out the characters people mistype reading one out loud.
  it('avoids the characters that get misread aloud', async () => {
    const codes = await Promise.all([invite(alice), invite(alice), invite(alice)]);

    expect(codes.join('')).not.toMatch(/[01IOL]/);
  });

  it('refuses somebody who is not the owner', async () => {
    const { error } = await bob.client.rpc('create_diary_invite', {
      target_diary: alice.diaryId,
    });

    expect(error?.code).toEqual('42501');
  });

  // A member is not an owner. Being let into a diary is not permission to let
  // other people in.
  it('refuses a member who is not the owner', async () => {
    await share();

    const { error } = await bob.client.rpc('create_diary_invite', {
      target_diary: alice.diaryId,
    });

    expect(error?.code).toEqual('42501');
  });

  it('refuses a life longer than a month', async () => {
    const { error } = await alice.client.rpc('create_diary_invite', {
      target_diary: alice.diaryId,
      valid_days: 400,
    });

    expect(error?.code).toEqual('22023');
  });
});

describe('using an invitation', () => {
  it('puts the invited person in the diary', async () => {
    const code = await invite(alice);

    const { data, error } = await accept(bob, code);

    expect(error).toBeNull();
    expect(data).toEqual(alice.diaryId);
  });

  it('lets them read what is in it', async () => {
    await createEntry(alice, { body: 'Something we are both part of.' });
    await share();

    expect(await bodiesVisibleTo(bob, alice.diaryId)).toEqual(['Something we are both part of.']);
  });

  it('lets them write in it', async () => {
    await share();

    await expect(
      createEntry(bob, { diary_id: alice.diaryId, body: 'Mine, in ours.' }),
    ).resolves.toEqual(expect.any(String));
  });

  it('marks the diary as shared', async () => {
    await share();

    const { data } = await adminClient().from('diaries').select('kind').eq('id', alice.diaryId);

    expect(data?.[0]?.kind).toEqual('shared');
  });

  it('is single use', async () => {
    const code = await invite(alice);
    await accept(bob, code);
    await unshare();

    const { error } = await accept(bob, code);

    expect(error?.code).toEqual('22023');
  });

  it('is refused once it has expired', async () => {
    const code = await invite(alice);
    await adminClient()
      .from('diary_invites')
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('diary_id', alice.diaryId);

    const { error } = await accept(bob, code);

    expect(error?.code).toEqual('22023');
  });

  it('is refused once it has been revoked', async () => {
    const code = await invite(alice);
    const { error: revokeError } = await alice.client
      .from('diary_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('diary_id', alice.diaryId);

    expect(revokeError).toBeNull();
    expect((await accept(bob, code)).error?.code).toEqual('22023');
  });

  it('refuses a code that matches nothing', async () => {
    expect((await accept(bob, 'AAAAAAAAAAAA')).error?.code).toEqual('22023');
  });

  it('refuses the person who sent it', async () => {
    const code = await invite(alice);

    expect((await accept(alice, code)).error?.code).toEqual('22023');
  });

  it('refuses somebody already in the diary', async () => {
    await share();
    const code = await invite(alice);

    expect((await accept(bob, code)).error?.code).toEqual('22023');
  });

  // Otherwise this is an oracle for which codes exist: try one, and a
  // different message for "expired" than for "no such thing" tells you that
  // you guessed a real one.
  it('says the same thing however it refuses', async () => {
    const used = await invite(alice);
    await accept(bob, used);
    await unshare();

    const messages = [
      (await accept(bob, 'AAAAAAAAAAAA')).error?.message,
      (await accept(bob, used)).error?.message,
      (await accept(alice, await invite(alice))).error?.message,
    ];

    expect(new Set(messages).size).toEqual(1);
  });

  it('is case and whitespace forgiving, because people type it by hand', async () => {
    const code = await invite(alice);

    const { error } = await accept(bob, `  ${code.toLowerCase()} `);

    expect(error).toBeNull();
  });
});

/**
 * The write the whole design turns on.
 *
 * Every one of these is somebody trying to get a `diary_members` row without an
 * invitation. If any of them succeeds, sharing is not a feature, it is a hole.
 */
describe('joining a diary without being asked', () => {
  it('cannot be done by inserting the row directly', async () => {
    const { error } = await bob.client
      .from('diary_members')
      .insert({ diary_id: alice.diaryId, user_id: bob.user.id, role: 'member' });

    expect(error?.code).toEqual('42501');
  });

  it('cannot be done by claiming to be an owner', async () => {
    const { error } = await bob.client
      .from('diary_members')
      .insert({ diary_id: alice.diaryId, user_id: bob.user.id, role: 'owner' });

    expect(error?.code).toEqual('42501');
  });

  it('cannot be done by making a diary row point at somebody else', async () => {
    const { error } = await bob.client
      .from('diaries')
      .update({ owner_id: bob.user.id })
      .eq('id', alice.diaryId);

    expect(error).toBeNull();

    // The update matched nothing — alice's diary is not visible to bob, so
    // there was no row to change.
    expect(await bodiesVisibleTo(bob, alice.diaryId)).toEqual([]);
  });

  it('leaves a stranger with no sight of the diary at all', async () => {
    await createEntry(alice, { body: 'Not for you.' });
    await share();

    expect(await bodiesVisibleTo(stranger, alice.diaryId)).toEqual([]);
  });
});

/**
 * The part sharing makes necessary.
 *
 * Without this, the only way to keep one difficult entry out of a shared diary
 * is not to write it.
 */
describe('a page the other person cannot read', () => {
  it('hides a personal entry from the other member', async () => {
    await share();
    await createEntry(alice, { body: 'Ours.' });
    await createEntry(alice, { body: 'Mine alone.', is_personal: true });

    expect(await bodiesVisibleTo(bob, alice.diaryId)).toEqual(['Ours.']);
  });

  it('still shows it to its own author', async () => {
    await share();
    await createEntry(alice, { body: 'Mine alone.', is_personal: true });

    expect(await bodiesVisibleTo(alice, alice.diaryId)).toEqual(['Mine alone.']);
  });

  it('hides every entry in a personal thread', async () => {
    await share();
    const { data } = await alice.client
      .from('threads')
      .insert({
        diary_id: alice.diaryId,
        title: 'The one I am not ready to talk about',
        created_by: alice.user.id,
        is_personal: true,
      })
      .select('id')
      .single();

    await createEntry(alice, { body: 'Part of it.', thread_id: data?.id });
    await createEntry(alice, { body: 'Ours.' });

    expect(await bodiesVisibleTo(bob, alice.diaryId)).toEqual(['Ours.']);
  });

  // The title of a thread can say as much as the entries in it.
  it('hides the personal thread itself, not only its contents', async () => {
    await share();
    await alice.client.from('threads').insert({
      diary_id: alice.diaryId,
      title: 'The one I am not ready to talk about',
      created_by: alice.user.id,
      is_personal: true,
    });

    const { data } = await bob.client.from('threads').select('title').eq('diary_id', alice.diaryId);

    expect(data).toEqual([]);
  });

  it('leaves an ordinary thread visible to both', async () => {
    await share();
    await alice.client.from('threads').insert({
      diary_id: alice.diaryId,
      title: 'The move',
      created_by: alice.user.id,
    });

    const { data } = await bob.client.from('threads').select('title').eq('diary_id', alice.diaryId);

    expect(data?.map((row) => row.title)).toEqual(['The move']);
  });

  it('does not let the other member read it by asking for it by id', async () => {
    await share();
    const id = await createEntry(alice, { body: 'Mine alone.', is_personal: true });

    const { data } = await bob.client.from('journal_entries').select('body').eq('id', id);

    expect(data).toEqual([]);
  });
});

describe('whose entry it is', () => {
  it('lets the author edit their own', async () => {
    await share();
    const id = await createEntry(alice, { body: 'First draft.' });

    const { error } = await alice.client
      .from('journal_entries')
      .update({ body: 'Second draft.' })
      .eq('id', id);

    expect(error).toBeNull();
  });

  // Harmless while every diary had one member; not the moment there are two.
  it('does not let the other member edit it', async () => {
    await share();
    const id = await createEntry(alice, { body: 'First draft.' });

    await bob.client
      .from('journal_entries')
      .update({ body: 'Rewritten by somebody else.' })
      .eq('id', id);

    expect(await bodiesVisibleTo(alice, alice.diaryId)).toEqual(['First draft.']);
  });

  it('does not let the other member delete it', async () => {
    await share();
    await createEntry(alice, { body: 'Still here.' });

    await bob.client.from('journal_entries').delete().eq('diary_id', alice.diaryId);

    expect(await bodiesVisibleTo(alice, alice.diaryId)).toEqual(['Still here.']);
  });
});

describe('leaving', () => {
  it('lets a member go', async () => {
    await share();

    const { data, error } = await bob.client.rpc('leave_diary', { target_diary: alice.diaryId });

    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('takes their access with them', async () => {
    await share();
    await createEntry(alice, { body: 'Ours, once.' });

    await bob.client.rpc('leave_diary', { target_diary: alice.diaryId });

    expect(await bodiesVisibleTo(bob, alice.diaryId)).toEqual([]);
  });

  // A shared record of a year is not something one person takes away with
  // them, and a leave that deleted would let somebody erase half an archive
  // from their own phone.
  it('destroys nothing on the way out', async () => {
    await share();
    await createEntry(alice, { body: 'Hers.' });
    await createEntry(bob, { diary_id: alice.diaryId, body: 'His, written in theirs.' });

    await bob.client.rpc('leave_diary', { target_diary: alice.diaryId });

    expect((await bodiesVisibleTo(alice, alice.diaryId)).sort()).toEqual([
      'Hers.',
      'His, written in theirs.',
    ]);
  });

  // They would leave a diary nobody can administer. The owner's route out is
  // deleting the diary or the account, both of which say what they do.
  it('refuses to let the owner leave', async () => {
    const { error } = await alice.client.rpc('leave_diary', { target_diary: alice.diaryId });

    expect(error?.code).toEqual('42501');
  });

  it('reports nothing done for a diary the caller was never in', async () => {
    const { data } = await stranger.client.rpc('leave_diary', { target_diary: alice.diaryId });

    expect(data).toBe(false);
  });

  it('can be invited back afterwards', async () => {
    await share();
    await bob.client.rpc('leave_diary', { target_diary: alice.diaryId });

    const { error } = await accept(bob, await invite(alice));

    expect(error).toBeNull();
  });
});

describe('who else is here', () => {
  it('lists the members for somebody in the diary', async () => {
    await share();

    const { data, error } = await alice.client.rpc('diary_members_with_names', {
      target_diary: alice.diaryId,
    });

    expect(error).toBeNull();
    expect((data ?? []).map((row: { role: string }) => row.role)).toEqual(['owner', 'member']);
  });

  it('tells a stranger nothing', async () => {
    await share();

    const { data } = await stranger.client.rpc('diary_members_with_names', {
      target_diary: alice.diaryId,
    });

    expect(data ?? []).toEqual([]);
  });

  // The function reaches past the profiles policy to read a display name, so
  // it has to be checked that it reaches no further.
  it('returns a name and nothing else from the profile', async () => {
    await share();

    const { data } = await bob.client.rpc('diary_members_with_names', {
      target_diary: alice.diaryId,
    });

    const keys = Object.keys((data as Record<string, unknown>[])[0] ?? {});
    expect(keys.sort()).toEqual(['display_name', 'joined_at', 'role', 'user_id']);
  });
});

/**
 * The regression this feature nearly caused.
 *
 * The app finds the diary it writes into on every sign-in. That lookup used to
 * ask for `kind = 'personal'`, which was correct until the moment inviting
 * somebody flipped that same diary to 'shared' — at which point it would have
 * matched nothing, and sync would have stopped silently for exactly the people
 * who used the newest feature.
 *
 * Tested here rather than in the unit suite because the thing that broke it is
 * a column the database changes by itself.
 */
describe('finding your own diary after sharing it', () => {
  it('is still found once it has become shared', async () => {
    await share();

    const { data } = await alice.client
      .from('diaries')
      .select('id, kind')
      .eq('owner_id', alice.user.id)
      .order('created_at', { ascending: true })
      .limit(1);

    expect(data?.[0]?.id).toEqual(alice.diaryId);
    expect(data?.[0]?.kind).toEqual('shared');
  });

  // The query the old code ran. Kept as a test so the reason the lookup changed
  // is written down in the place somebody would look.
  it('would have found nothing under the old query', async () => {
    await share();

    const { data } = await alice.client
      .from('diaries')
      .select('id')
      .eq('kind', 'personal')
      .order('created_at', { ascending: true })
      .limit(1);

    expect(data).toEqual([]);
  });

  // The person who joined keeps their own, which must not be confused for the
  // one they were invited into.
  it('gives the invited person their own diary, not the one they joined', async () => {
    await share();

    const { data } = await bob.client
      .from('diaries')
      .select('id')
      .eq('owner_id', bob.user.id)
      .order('created_at', { ascending: true })
      .limit(1);

    expect(data?.[0]?.id).toEqual(bob.diaryId);
  });
});
