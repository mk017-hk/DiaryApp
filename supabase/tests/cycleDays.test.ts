import { createClient } from '@supabase/supabase-js';

import { adminClient, createTestUser, deleteTestUser, localStack, type TestUser } from './helpers';

/**
 * Cycle days.
 *
 * The property that matters most is the one sharing could break: somebody who
 * shares a diary with you can read that diary, and nothing about your cycle.
 * Then the ordinary ones — nobody else can read, write, forge or delete a day;
 * a stale phone cannot overwrite a newer log; and a log sent late by a phone
 * that was offline is still seen by the other one.
 *
 * Requires the local stack: npx supabase start
 */

jest.setTimeout(90_000);

let alice: TestUser;
let bob: TestUser;

const day = (date: string, changes: Record<string, unknown> = {}) => ({
  user_id: alice.user.id,
  log_date: date,
  period: true,
  flow: 'medium',
  symptoms: ['cramps'],
  moods: ['sad'],
  intimacy: [],
  updated_at: '2026-11-01T10:00:00.000Z',
  ...changes,
});

const aliceDays = async (client = alice.client) => {
  const { data, error } = await client
    .from('cycle_days')
    .select('log_date, flow, updated_at, synced_at')
    .eq('user_id', alice.user.id)
    .order('log_date');
  if (error !== null) throw error;
  return data;
};

beforeAll(async () => {
  alice = await createTestUser('alice-cycle');
  bob = await createTestUser('bob-cycle');
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(bob);
});

beforeEach(async () => {
  await adminClient().from('cycle_days').delete().in('user_id', [alice.user.id, bob.user.id]);
});

describe('the owner', () => {
  it('writes and reads her own days', async () => {
    const { error } = await alice.client.from('cycle_days').insert(day('2026-11-01'));
    expect(error).toBeNull();
    expect(await aliceDays()).toEqual([
      expect.objectContaining({ log_date: '2026-11-01', flow: 'medium' }),
    ]);
  });

  it('gets her own id by default, without sending one', async () => {
    const { user_id: _omitted, ...withoutOwner } = day('2026-11-02');
    const { error } = await alice.client.from('cycle_days').insert(withoutOwner);
    expect(error).toBeNull();
    expect(await aliceDays()).toHaveLength(1);
  });
});

describe('everybody else', () => {
  beforeEach(async () => {
    const { error } = await alice.client.from('cycle_days').insert(day('2026-11-01'));
    if (error !== null) throw error;
  });

  it('cannot read her days', async () => {
    expect(await aliceDays(bob.client)).toEqual([]);
  });

  it('cannot read them through a diary she shares with them', async () => {
    const { data: code, error: inviteError } = await alice.client.rpc('create_diary_invite', {
      target_diary: alice.diaryId,
    });
    if (inviteError !== null) throw inviteError;
    const { error: acceptError } = await bob.client.rpc('accept_diary_invite', { code });
    if (acceptError !== null) throw acceptError;

    // Bob can read her diary now — the sharing works…
    const { data: diaries } = await bob.client.from('diaries').select('id').eq('id', alice.diaryId);
    expect(diaries).toHaveLength(1);
    // …and still not one day of her cycle.
    expect(await aliceDays(bob.client)).toEqual([]);

    await adminClient()
      .from('diary_members')
      .delete()
      .eq('diary_id', alice.diaryId)
      .eq('user_id', bob.user.id);
  });

  it('cannot write a day in her name', async () => {
    const { error } = await bob.client.from('cycle_days').insert(day('2026-11-05'));
    expect(error).not.toBeNull();
    expect(await aliceDays()).toHaveLength(1);
  });

  it('cannot change or delete her days', async () => {
    await bob.client.from('cycle_days').update({ flow: 'heavy' }).eq('user_id', alice.user.id);
    await bob.client.from('cycle_days').delete().eq('user_id', alice.user.id);

    expect(await aliceDays()).toEqual([expect.objectContaining({ flow: 'medium' })]);
  });

  it('cannot move one of their own days into her name', async () => {
    await bob.client.from('cycle_days').insert({ ...day('2026-11-09'), user_id: bob.user.id });
    const { error } = await bob.client
      .from('cycle_days')
      .update({ user_id: alice.user.id })
      .eq('user_id', bob.user.id);
    expect(error).not.toBeNull();
    expect(await aliceDays()).toHaveLength(1);
  });

  it('reads nothing at all without signing in', async () => {
    const { apiUrl, anonKey } = localStack();
    const anon = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
    const { data } = await anon.from('cycle_days').select('*');
    expect(data ?? []).toEqual([]);
  });
});

describe('two phones', () => {
  it('keeps the newer log when an older one arrives late', async () => {
    await alice.client
      .from('cycle_days')
      .upsert(day('2026-11-01', { flow: 'heavy', updated_at: '2026-11-01T12:00:00.000Z' }), {
        onConflict: 'user_id,log_date',
      });

    // The other phone logged "light" earlier, and only now has a signal.
    const { data } = await alice.client
      .from('cycle_days')
      .upsert(day('2026-11-01', { flow: 'light', updated_at: '2026-11-01T09:00:00.000Z' }), {
        onConflict: 'user_id,log_date',
      })
      .select('flow');

    // The answer hands the winner back, which is how the late phone learns.
    expect(data).toEqual([{ flow: 'heavy' }]);
    expect(await aliceDays()).toEqual([expect.objectContaining({ flow: 'heavy' })]);
  });

  it('is seen by the other phone even when it was logged before that phone last looked', async () => {
    // Phone A pulls, and remembers how far it got.
    await alice.client.from('cycle_days').insert(day('2026-11-01'));
    const [first] = await aliceDays();
    const watermark = first?.synced_at as string;

    // Phone B logged a different day yesterday, offline, and sends it now —
    // with an authoring time well before A's watermark.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await alice.client
      .from('cycle_days')
      .insert(day('2026-10-31', { updated_at: '2026-10-31T08:00:00.000Z' }));

    // A's next pull, from its watermark, still finds it: the watermark is in
    // the account's time, not the phone's.
    const { data } = await alice.client
      .from('cycle_days')
      .select('log_date')
      .gte('synced_at', watermark)
      .order('synced_at');
    expect((data ?? []).map((row) => row.log_date)).toContain('2026-10-31');
  });

  it('does not move the watermark for a write it refused', async () => {
    await alice.client
      .from('cycle_days')
      .insert(day('2026-11-01', { updated_at: '2026-11-01T12:00:00.000Z' }));
    const [before] = await aliceDays();

    await alice.client
      .from('cycle_days')
      .upsert(day('2026-11-01', { flow: 'light', updated_at: '2026-11-01T09:00:00.000Z' }), {
        onConflict: 'user_id,log_date',
      });
    const [after] = await aliceDays();

    expect(after?.synced_at).toEqual(before?.synced_at);
  });
});

describe('what a day can say', () => {
  it.each([
    ['a flow that is not one', { flow: 'gushing' }],
    ['a symptom that is not one', { symptoms: ['cramps', 'werewolf'] }],
    ['a mood that is not a slug', { moods: ['DROP TABLE'] }],
    ['an impossible night of sleep', { sleep_hours: 30 }],
  ])('refuses %s', async (_label, changes) => {
    const { error } = await alice.client.from('cycle_days').insert(day('2026-11-03', changes));
    expect(error).not.toBeNull();
  });
});

it('goes with the account when it is deleted', async () => {
  const carol = await createTestUser('carol-cycle');
  await carol.client.from('cycle_days').insert({ ...day('2026-11-01'), user_id: carol.user.id });
  await deleteTestUser(carol);

  const { data } = await adminClient()
    .from('cycle_days')
    .select('log_date')
    .eq('user_id', carol.user.id);
  expect(data).toEqual([]);
});
