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
 * The assistant Edge Function, running for real.
 *
 * There is no model key in local development, and that is deliberately a
 * supported state rather than a broken one: the function reports how much
 * context it assembled and stops before the one call that leaves our
 * infrastructure. Everything up to that point — the JWT check, the
 * SECURITY INVOKER read, consent, every exclusion — is exercised here.
 *
 * Requires the stack and the functions runtime:
 *   npx supabase start
 */

jest.setTimeout(60_000);

let alice: TestUser;
let mallory: TestUser;

const endpoint = () => `${localStack().apiUrl}/functions/v1/assistant`;

const call = (token: string | null, method = 'POST') =>
  fetch(endpoint(), {
    method,
    headers: {
      apikey: localStack().anonKey,
      'Content-Type': 'application/json',
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
  });

const tokenFor = async (user: TestUser) =>
  (await user.client.auth.getSession()).data.session?.access_token ?? '';

const consent = (user: TestUser, enabled: boolean) =>
  user.client.rpc('set_assistant_consent', { enabled });

beforeAll(async () => {
  const probe = await call(null).catch(() => null);
  if (probe === null || probe.status === 503) {
    throw new Error('The assistant function is not being served. Run: npx supabase start');
  }

  alice = await createTestUser('alice');
  mallory = await createTestUser('mallory');
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(mallory);
});

describe('who may ask', () => {
  it('refuses a request with no token', async () => {
    expect((await call(null)).status).toEqual(401);
  });

  it('refuses a forged token', async () => {
    expect((await call('not.a.real.jwt')).status).toEqual(401);
  });

  it('refuses anything but POST', async () => {
    expect((await call(await tokenFor(alice), 'GET')).status).toEqual(405);
  });
});

describe('consent', () => {
  it('assembles nothing for someone who has not consented', async () => {
    await createEntry(alice, { body: 'Written before being asked.' });

    const response = await call(await tokenFor(alice));
    const body = (await response.json()) as { outcome: string; reason?: string };

    expect(response.status).toEqual(200);
    expect(body.outcome).toEqual('silence');
    expect(body.reason).toEqual('no_context');
  });

  it('assembles context once consent is given', async () => {
    await consent(alice, true);

    const body = (await (await call(await tokenFor(alice))).json()) as {
      outcome: string;
      reason?: string;
      cited?: number;
    };

    // No provider key locally, so it stops here — having done all the work
    // that matters, which is the point of reporting the count.
    expect(body.outcome).toEqual('silence');
    expect(body.reason).toEqual('no_model_configured');
    expect(body.cited ?? 0).toBeGreaterThan(0);
  });

  it('stops again the moment consent is withdrawn', async () => {
    await consent(alice, false);

    const body = (await (await call(await tokenFor(alice))).json()) as { reason?: string };
    expect(body.reason).toEqual('no_context');

    await consent(alice, true);
  });
});

describe('what it can reach', () => {
  // The function reads with the caller's own token against a SECURITY INVOKER
  // function, so RLS confines it. The service role is used only to write.
  it('counts only the caller’s own entries', async () => {
    await consent(mallory, true);
    for (let i = 0; i < 3; i += 1) {
      await createEntry(mallory, { body: `Mallory wrote this, number ${String(i)}.` });
    }

    const hers = (await (await call(await tokenFor(mallory))).json()) as { cited?: number };
    const alices = (await (await call(await tokenFor(alice))).json()) as { cited?: number };

    expect(hers.cited).toEqual(3);
    // Alice has her own entries and none of Mallory's three.
    expect(alices.cited).not.toEqual(hers.cited);
  });

  it('does not count an entry in a private thread', async () => {
    const before = (await (await call(await tokenFor(mallory))).json()) as { cited?: number };

    const secret = await createThread(mallory, true);
    await createEntry(mallory, { thread_id: secret, body: 'The thing marked private.' });

    const after = (await (await call(await tokenFor(mallory))).json()) as { cited?: number };

    expect(after.cited).toEqual(before.cited);
  });

  it('does not count an entry marked ai_excluded', async () => {
    const before = (await (await call(await tokenFor(mallory))).json()) as { cited?: number };

    await createEntry(mallory, { body: 'Held back.', ai_excluded: true });

    const after = (await (await call(await tokenFor(mallory))).json()) as { cited?: number };

    expect(after.cited).toEqual(before.cited);
  });
});

describe('what a client may and may not do with the result', () => {
  // Only the function writes these. A client that could author one could put
  // words in the assistant's mouth, which for this product is a way of
  // saying something cruel to somebody and blaming the app.
  it('refuses to let a client author a message', async () => {
    const { error } = await alice.client.from('ai_messages').insert({
      diary_id: alice.diaryId,
      user_id: alice.user.id,
      kind: 'question',
      content: 'A question I wrote myself.',
      based_on_entry_ids: [],
    });

    expect(error).not.toBeNull();
  });

  it('lets a person read and dismiss their own', async () => {
    const admin = adminClient();
    const entryId = await createEntry(alice, { body: 'Something a question came from.' });

    const { error: writeError } = await admin.from('ai_messages').insert({
      diary_id: alice.diaryId,
      user_id: alice.user.id,
      kind: 'question',
      content: 'what did the light look like?',
      based_on_entry_ids: [entryId],
    });
    expect(writeError).toBeNull();

    const { data } = await alice.client
      .from('ai_messages')
      .select('id, content, based_on_entry_ids')
      .eq('user_id', alice.user.id);

    expect((data ?? []).length).toBeGreaterThan(0);
    // The honesty feature: a person can always see what it was drawn from.
    expect(data?.[0]?.based_on_entry_ids).toContain(entryId);

    const { error: dismissError } = await alice.client
      .from('ai_messages')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', data?.[0]?.id as string);

    expect(dismissError).toBeNull();
  });

  it('hides one person’s messages from another', async () => {
    const { data } = await mallory.client
      .from('ai_messages')
      .select('content')
      .eq('user_id', alice.user.id);

    expect(data ?? []).toEqual([]);
  });
});
