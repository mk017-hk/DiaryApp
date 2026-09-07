import { adminClient, createEntry, localStack, signUpTestUser } from './helpers';

/**
 * Account deletion, against the real Edge Function.
 *
 * The App Store requires this and the function holds the service role key, so
 * it is the single most dangerous piece of code in the project: a mistake here
 * is either somebody's diary surviving a deletion they asked for, or somebody
 * else's being destroyed by a request they never made. Both are tested.
 *
 * Needs the function server as well as the stack:
 *   npx supabase start && npx supabase functions serve
 */

jest.setTimeout(60_000);

const endpoint = () => `${localStack().apiUrl}/functions/v1/delete-account`;

const call = (token: string | null, method = 'POST', body?: unknown) =>
  fetch(endpoint(), {
    method,
    headers: {
      apikey: localStack().anonKey,
      'Content-Type': 'application/json',
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const accessToken = async (user: { client: { auth: { getSession: () => Promise<unknown> } } }) => {
  const result = (await user.client.auth.getSession()) as {
    data: { session: { access_token: string } | null };
  };
  return result.data.session?.access_token ?? '';
};

beforeAll(async () => {
  const probe = await call(null).catch(() => null);
  if (probe === null || probe.status === 503) {
    throw new Error('delete-account is not being served. Run: npx supabase functions serve');
  }
});

describe('who may delete an account', () => {
  it('refuses a request carrying no token', async () => {
    expect((await call(null)).status).toEqual(401);
  });

  it('refuses a forged token', async () => {
    expect((await call('not.a.real.jwt')).status).toEqual(401);
  });

  it('refuses anything but POST, so a link cannot trigger it', async () => {
    const user = await signUpTestUser('getter');
    const token = await accessToken(user);

    expect((await call(token, 'GET')).status).toEqual(405);

    await call(token); // tidy up
  });

  /**
   * The whole reason the function takes no id.
   *
   * One account deleting itself must leave every other account untouched. If
   * this ever fails, the function has become a way to delete strangers.
   */
  it('deletes only the caller, never anybody else', async () => {
    const [mine, theirs] = await Promise.all([signUpTestUser('mine'), signUpTestUser('theirs')]);
    const token = await accessToken(mine);

    expect((await call(token)).status).toEqual(200);

    const admin = adminClient();
    const { data: survivor } = await admin.auth.admin.getUserById(theirs.user.id);
    const { data: deleted } = await admin.auth.admin.getUserById(mine.user.id);

    expect(survivor.user?.id).toEqual(theirs.user.id);
    expect(deleted.user).toBeNull();

    await admin.auth.admin.deleteUser(theirs.user.id);
  });

  /**
   * The attack the design exists to prevent, actually attempted.
   *
   * A signed-in user asks the function to delete somebody else, by every name
   * such a parameter has ever been given. The identity must come from the
   * verified token and nothing else, so all of this is ignored: the target
   * survives, and the caller deletes themselves as they asked.
   *
   * Written after a deliberately broken version of the function — one that
   * read `user_id` from the body — passed the test above. It passed because it
   * never sent a body. This one does.
   */
  it('ignores a victim named in the request body', async () => {
    const [attacker, target] = await Promise.all([
      signUpTestUser('attacker'),
      signUpTestUser('target'),
    ]);
    const token = await accessToken(attacker);

    const response = await call(token, 'POST', {
      user_id: target.user.id,
      userId: target.user.id,
      id: target.user.id,
      sub: target.user.id,
      email: `${target.user.email ?? ''}`,
    });

    const admin = adminClient();
    const { data: survivor } = await admin.auth.admin.getUserById(target.user.id);
    const { data: caller } = await admin.auth.admin.getUserById(attacker.user.id);

    expect(survivor.user?.id).toEqual(target.user.id);
    // Whether the request is accepted or refused is a detail; that it deleted
    // the caller and not the target is the whole point.
    expect(response.status).toBeLessThan(500);
    expect(caller.user).toBeNull();

    await admin.auth.admin.deleteUser(target.user.id);
  });

  it('cannot be aimed with a query string either', async () => {
    const [attacker, target] = await Promise.all([
      signUpTestUser('qattacker'),
      signUpTestUser('qtarget'),
    ]);
    const token = await accessToken(attacker);

    await fetch(`${endpoint()}?user_id=${target.user.id}&id=${target.user.id}`, {
      method: 'POST',
      headers: { apikey: localStack().anonKey, Authorization: `Bearer ${token}` },
    });

    const admin = adminClient();
    const { data: survivor } = await admin.auth.admin.getUserById(target.user.id);
    expect(survivor.user?.id).toEqual(target.user.id);

    await admin.auth.admin.deleteUser(target.user.id);
    await admin.auth.admin.deleteUser(attacker.user.id).catch(() => undefined);
  });
});

describe('what a deletion actually deletes', () => {
  it('takes the entries, the diary and the stored media with it', async () => {
    const user = await signUpTestUser('leaver');
    const entryId = await createEntry(user);

    const storagePath = `${user.diaryId}/${entryId}/clip.wav`;
    const { error: uploadError } = await user.client.storage
      .from('entry-media')
      .upload(storagePath, new Blob(['bytes'], { type: 'audio/wav' }), {
        contentType: 'audio/wav',
      });
    expect(uploadError).toBeNull();

    const { error: mediaError } = await user.client.from('entry_media').insert({
      entry_id: entryId,
      diary_id: user.diaryId,
      kind: 'audio',
      storage_path: storagePath,
      mime_type: 'audio/wav',
      size_bytes: 5,
    });
    expect(mediaError).toBeNull();

    const token = await accessToken(user);
    expect((await call(token)).status).toEqual(200);

    // Checked with the service role, which sees past RLS. Asking as the
    // deleted user would return nothing whether or not the rows survived, and
    // would prove precisely nothing.
    const admin = adminClient();

    const { data: entries } = await admin.from('journal_entries').select('id').eq('id', entryId);
    expect(entries ?? []).toEqual([]);

    const { data: diaries } = await admin.from('diaries').select('id').eq('id', user.diaryId);
    expect(diaries ?? []).toEqual([]);

    const { data: authUser } = await admin.auth.admin.getUserById(user.user.id);
    expect(authUser.user).toBeNull();

    // The one thing no cascade covers: a storage object is not a row, and a
    // video left in the bucket outlives every trace of who it belonged to.
    const { data: objects } = await admin.storage
      .from('entry-media')
      .list(`${user.diaryId}/${entryId}`);
    expect(objects ?? []).toEqual([]);
  });

  it('leaves a token for the deleted account useless', async () => {
    const user = await signUpTestUser('ghost');
    const token = await accessToken(user);

    expect((await call(token)).status).toEqual(200);
    expect((await call(token)).status).toEqual(401);
  });
});
