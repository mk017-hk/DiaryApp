import {
  createEntry,
  createTestUser,
  createThread,
  deleteTestUser,
  type TestUser,
} from './helpers';

/**
 * What the assistant is allowed to read.
 *
 * The most consequential tests in this project after the isolation suite. A
 * mistake here does not leak data to a stranger — it puts something somebody
 * marked private into a prompt, which is a different kind of betrayal and,
 * for the use case this app was described around, a worse one.
 *
 * Every rule is checked from the outside: not "does the function filter" but
 * "given this row, does it come back". The rules live in SQL precisely so that
 * a forgetful Edge Function cannot bypass them, so SQL is where they are
 * tested.
 *
 * Requires the local stack: npx supabase start
 */

jest.setTimeout(60_000);

let alice: TestUser;
let mallory: TestUser;

interface ContextRow {
  entry_id: string;
  body: string | null;
  thread_title: string | null;
}

const contextFor = async (user: TestUser, days = 14) => {
  const { data, error } = await user.client.rpc('assistant_context', { window_days: days });
  if (error !== null) throw error;
  return (data ?? []) as ContextRow[];
};

const bodies = async (user: TestUser, days = 14) =>
  (await contextFor(user, days)).map((row) => row.body);

/** Consent, as the app records it. Enabled by default is not consent. */
const consent = (user: TestUser, enabled: boolean) =>
  user.client.rpc('set_assistant_consent', { enabled });

const dated = (daysAgo: number) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
};

beforeAll(async () => {
  alice = await createTestUser('alice');
  mallory = await createTestUser('mallory');
  await consent(alice, true);
  await consent(mallory, true);
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(mallory);
});

describe('consent gates everything', () => {
  it('returns nothing at all before consent has been given', async () => {
    const fresh = await createTestUser('unconsented');
    await createEntry(fresh, { body: 'Written before being asked.' });

    expect(await contextFor(fresh)).toEqual([]);

    await deleteTestUser(fresh);
  });

  it('returns nothing once consent is withdrawn', async () => {
    const leaver = await createTestUser('leaver');
    await consent(leaver, true);
    await createEntry(leaver, { body: 'While it was on.' });

    expect((await contextFor(leaver)).length).toBeGreaterThan(0);

    await consent(leaver, false);
    expect(await contextFor(leaver)).toEqual([]);

    await deleteTestUser(leaver);
  });

  // Withdrawing must not erase the record that they were once asked, or a
  // second ask would look like a first one.
  it('keeps the date consent was first given after it is withdrawn', async () => {
    const user = await createTestUser('returner');
    await consent(user, true);

    const { data: given } = await user.client
      .from('profiles')
      .select('ai_consented_at')
      .eq('id', user.user.id)
      .single();

    await consent(user, false);

    const { data: after } = await user.client
      .from('profiles')
      .select('ai_enabled, ai_consented_at')
      .eq('id', user.user.id)
      .single();

    expect(after?.ai_enabled).toBe(false);
    expect(after?.ai_consented_at).toEqual(given?.ai_consented_at);

    await deleteTestUser(user);
  });
});

describe('what is excluded, and must stay excluded', () => {
  // The rule this whole file exists for. The concept notes use a miscarriage
  // as the worked example: someone marks that thread private, and nothing in
  // it may ever reach a model.
  it('never returns an entry in a private thread', async () => {
    const privateThread = await createThread(alice, true);
    await createEntry(alice, {
      thread_id: privateThread,
      body: 'The thing I marked private.',
    });

    expect(await bodies(alice)).not.toContain('The thing I marked private.');
  });

  it('returns an entry in an ordinary thread', async () => {
    const openThread = await createThread(alice);
    await createEntry(alice, { thread_id: openThread, body: 'An ordinary thread entry.' });

    expect(await bodies(alice)).toContain('An ordinary thread entry.');
  });

  // Independently of the thread: one entry can be held back without hiding
  // the story it belongs to.
  it('never returns an entry marked ai_excluded', async () => {
    await createEntry(alice, { body: 'Just this one, kept back.', ai_excluded: true });

    expect(await bodies(alice)).not.toContain('Just this one, kept back.');
  });

  it('never returns a deleted entry', async () => {
    const id = await createEntry(alice, { body: 'Deleted since.' });
    await alice.client
      .from('journal_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    expect(await bodies(alice)).not.toContain('Deleted since.');
  });

  // RLS, through SECURITY INVOKER. The Edge Function calls this with the
  // caller's own token, so the assistant cannot read more of a diary than the
  // person whose diary it is.
  it('never returns another account’s entries', async () => {
    await createEntry(mallory, { body: 'Mallory wrote this.' });

    expect(await bodies(alice)).not.toContain('Mallory wrote this.');
  });
});

describe('the window', () => {
  it('includes something written recently', async () => {
    await createEntry(alice, { body: 'From this week.', entry_date: dated(2) });

    expect(await bodies(alice)).toContain('From this week.');
  });

  it('leaves out something from months ago', async () => {
    await createEntry(alice, { body: 'From the spring.', entry_date: dated(120) });

    expect(await bodies(alice)).not.toContain('From the spring.');
  });

  // An arc somebody is living through does not stop mattering because it
  // started five weeks ago. This is what lets the assistant follow a story
  // rather than react to yesterday.
  it('reaches back past the window for an open thread', async () => {
    const longRunning = await createThread(alice);
    await createEntry(alice, {
      thread_id: longRunning,
      body: 'The beginning of something ongoing.',
      entry_date: dated(120),
    });

    expect(await bodies(alice)).toContain('The beginning of something ongoing.');
  });

  it('stops reaching back once the thread is closed', async () => {
    const finished = await createThread(alice);
    const id = await createEntry(alice, {
      thread_id: finished,
      body: 'The beginning of something finished.',
      entry_date: dated(120),
    });

    expect(await bodies(alice)).toContain('The beginning of something finished.');

    await alice.client.from('threads').update({ status: 'closed' }).eq('id', finished);

    expect(await bodies(alice)).not.toContain('The beginning of something finished.');
    expect(id).toBeTruthy();
  });

  it('takes a window of zero to mean today only', async () => {
    await createEntry(alice, { body: 'Yesterday.', entry_date: dated(1) });

    expect(await bodies(alice, 0)).not.toContain('Yesterday.');
  });
});

describe('what it hands over', () => {
  it('carries the thread title, so a question can name the story', async () => {
    const named = await createThread(alice);
    await alice.client.from('threads').update({ title: 'Trying again' }).eq('id', named);
    await createEntry(alice, { thread_id: named, body: 'Part of it.' });

    const row = (await contextFor(alice)).find((item) => item.body === 'Part of it.');

    expect(row?.thread_title).toEqual('Trying again');
  });

  // The honesty feature: `based_on_entry_ids` is only meaningful if the ids
  // handed to the model are the ids that get recorded.
  it('carries entry ids, so a question can say what it was drawn from', async () => {
    const id = await createEntry(alice, { body: 'Something to cite.' });

    const row = (await contextFor(alice)).find((item) => item.body === 'Something to cite.');

    expect(row?.entry_id).toEqual(id);
  });

  it('caps how much comes back', async () => {
    const { data } = await alice.client.rpc('assistant_context', {
      window_days: 3650,
      max_entries: 2,
    });

    expect((data ?? []).length).toBeLessThanOrEqual(2);
  });

  it('refuses to be talked into an unbounded read', async () => {
    const { data } = await alice.client.rpc('assistant_context', {
      window_days: 3650,
      max_entries: 100000,
    });

    expect((data ?? []).length).toBeLessThanOrEqual(200);
  });
});
