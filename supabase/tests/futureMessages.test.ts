import { randomUUID } from 'node:crypto';

import { createTestUser, deleteTestUser, type TestUser } from './helpers';

/**
 * Future Me, and whether sealed actually means sealed.
 *
 * The feature is one property: between writing a letter and the day it opens,
 * nobody can read the body. The interesting word is "nobody" — not another
 * member of a shared diary, not someone holding a stolen token, and not the
 * author, who is the one with every ordinary right to the row and the one the
 * feature exists to keep out.
 *
 * So these tests are written as an attack rather than as a feature check. Each
 * one is a different way of asking the database for a sealed body: straight,
 * through a column list, through a filter, through an ordering, through an
 * update, through the metadata function. The feature is correct only if every
 * one of them comes back with nothing.
 *
 * Requires the local stack: npx supabase start
 */

jest.setTimeout(60_000);

let alice: TestUser;

interface Sealed {
  id: string;
  unlock_on: string;
  has_body: boolean;
}

const dated = (daysFromNow: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
};

/**
 * Writes a letter, with the id generated here rather than by Postgres.
 *
 * Not a style choice. `insert ... returning` applies the select policy to the
 * new row, and the select policy is the seal — so the database cannot tell the
 * caller what id it just assigned without unsealing the letter it assigned it
 * to. The client supplies the id, which is what the app does for entries
 * anyway.
 */
const write = async (
  user: TestUser,
  unlockOn: string,
  body = 'Something I wanted you to hear later.',
) => {
  const id = randomUUID();
  const { error } = await user.client
    .from('future_messages')
    .insert({ id, diary_id: user.diaryId, author_id: user.user.id, body, unlock_on: unlockOn });

  if (error !== null) throw error;
  return id;
};

/**
 * A row written straight into Postgres, bypassing the insert policy.
 *
 * For the cases that need a letter whose unlock date has already passed. The
 * check constraint stops the app writing one, correctly — this is the test
 * harness standing in for a year going by.
 */
const writeAlreadyOpen = async (user: TestUser, body: string, unlockOn: string) => {
  const { adminClient } = await import('./helpers');
  const id = randomUUID();
  const { error } = await adminClient()
    .from('future_messages')
    .insert({
      id,
      diary_id: user.diaryId,
      author_id: user.user.id,
      body,
      unlock_on: unlockOn,
      created_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
    });

  if (error !== null) throw error;
  return id;
};

const sealed = async (user: TestUser): Promise<Sealed[]> => {
  const { data, error } = await user.client.rpc('sealed_letters');
  if (error !== null) throw error;
  return (data ?? []) as Sealed[];
};

const open = async (user: TestUser, id: string) => {
  const { data, error } = await user.client.rpc('open_future_message', { message_id: id });
  if (error !== null) throw error;
  return (data ?? []) as { id: string; body: string | null; unlocked_at: string | null }[];
};

beforeAll(async () => {
  alice = await createTestUser('alice');
});

afterAll(async () => {
  await deleteTestUser(alice);
});

beforeEach(async () => {
  const { adminClient } = await import('./helpers');
  await adminClient().from('future_messages').delete().eq('diary_id', alice.diaryId);
});

describe('writing one', () => {
  it('accepts a letter for a date in the future', async () => {
    await expect(write(alice, dated(365))).resolves.toEqual(expect.any(String));
  });

  // Otherwise it is a note for tonight wearing the name of a feature about
  // time passing.
  it('refuses a letter that opens today', async () => {
    await expect(write(alice, dated(0))).rejects.toMatchObject({ code: '23514' });
  });

  it('refuses a letter dated into the past', async () => {
    await expect(write(alice, dated(-30))).rejects.toMatchObject({ code: '23514' });
  });

  // The reason the app generates the id rather than Postgres. `insert ...
  // returning` applies the select policy to the new row, and the select policy
  // is the seal — so the database cannot name the row it just wrote without
  // unsealing it. Refusing is the correct answer, and it is worth pinning down
  // so that nobody later "fixes" it by softening the policy.
  it('refuses to hand the row back on the way in', async () => {
    const { error } = await alice.client
      .from('future_messages')
      .insert({
        id: randomUUID(),
        diary_id: alice.diaryId,
        author_id: alice.user.id,
        body: 'Sealed the moment it exists.',
        unlock_on: dated(365),
      })
      .select('id');

    expect(error?.code).toEqual('42501');
  });

  it('refuses a letter attributed to somebody else', async () => {
    const mallory = await createTestUser('mallory');

    const { error } = await alice.client.from('future_messages').insert({
      diary_id: alice.diaryId,
      author_id: mallory.user.id,
      body: 'Not mine to sign.',
      unlock_on: dated(365),
    });

    expect(error?.code).toEqual('42501');
    await deleteTestUser(mallory);
  });

  it('refuses a letter aimed at a diary the caller is not in', async () => {
    const mallory = await createTestUser('mallory');

    const { error } = await mallory.client.from('future_messages').insert({
      diary_id: alice.diaryId,
      author_id: mallory.user.id,
      body: 'Posted through the wrong door.',
      unlock_on: dated(365),
    });

    expect(error?.code).toEqual('42501');
    await deleteTestUser(mallory);
  });
});

/**
 * The seal, attacked.
 *
 * Every one of these is the author, properly signed in, asking for her own row
 * in a different way. All of them must come back empty — if any single one
 * returns the body, the feature is a UI convention rather than a guarantee.
 */
describe('a sealed letter, asked for by its own author', () => {
  const SECRET = 'The thing I did not want to know yet.';

  it('does not come back from a plain select', async () => {
    await write(alice, dated(365), SECRET);

    const { data } = await alice.client.from('future_messages').select('*');

    expect(data).toEqual([]);
  });

  it('does not come back when only the body is asked for', async () => {
    await write(alice, dated(365), SECRET);

    const { data } = await alice.client.from('future_messages').select('body');

    expect(data).toEqual([]);
  });

  it('does not come back when asked for by its own id', async () => {
    const id = await write(alice, dated(365), SECRET);

    const { data } = await alice.client.from('future_messages').select('*').eq('id', id);

    expect(data).toEqual([]);
  });

  // A filter is a read. If the row can be distinguished by matching on its
  // contents, the contents are available one question at a time.
  it('cannot be probed a letter at a time with a filter on the body', async () => {
    await write(alice, dated(365), SECRET);

    const { data } = await alice.client
      .from('future_messages')
      .select('id')
      .ilike('body', '%did not want%');

    expect(data).toEqual([]);
  });

  it('cannot be ordered by, which would leak a letter against another', async () => {
    await write(alice, dated(365), 'aaa');
    await write(alice, dated(366), 'zzz');

    const { data } = await alice.client
      .from('future_messages')
      .select('id')
      .order('body', { ascending: true });

    expect(data).toEqual([]);
  });

  // `update ... returning` is a read, and the one most likely to be left open
  // by a policy written while thinking only about selects.
  it('cannot be read back through an update', async () => {
    await write(alice, dated(365), SECRET);

    const { data } = await alice.client
      .from('future_messages')
      .update({ unlock_on: dated(400) })
      .eq('diary_id', alice.diaryId)
      .select('body');

    expect(data ?? []).toEqual([]);
  });

  // The obvious attack if an update policy were written without the date: move
  // the date to today, then read it.
  it('cannot be brought forward and then read', async () => {
    const id = await write(alice, dated(365), SECRET);

    await alice.client
      .from('future_messages')
      .update({ unlock_on: dated(-1) })
      .eq('id', id);

    const { data } = await alice.client.from('future_messages').select('body').eq('id', id);

    expect(data).toEqual([]);
  });

  it('is refused by the open function too', async () => {
    const id = await write(alice, dated(365), SECRET);

    expect(await open(alice, id)).toEqual([]);
  });

  it('does not count, which would let it be probed by date', async () => {
    await write(alice, dated(365), SECRET);

    const { count } = await alice.client
      .from('future_messages')
      .select('*', { count: 'exact', head: true });

    expect(count).toEqual(0);
  });
});

describe('what she can see of a sealed letter', () => {
  it('knows it is there, and when it opens', async () => {
    await write(alice, dated(200));

    const letters = await sealed(alice);

    expect(letters).toHaveLength(1);
    expect(letters[0]?.unlock_on).toEqual(dated(200));
  });

  // The point is partly in knowing something is waiting. A feature that hid
  // the fact as well as the contents would just be a void.
  it('reports whether it has anything written in it', async () => {
    await write(alice, dated(200), 'Words.');

    expect((await sealed(alice))[0]?.has_body).toBe(true);
  });

  // A character count of a letter is a small leak of what it says, and there
  // is no reason to publish one.
  it('never reports the body, nor its length', async () => {
    await write(alice, dated(200), 'A sentence of a very particular length.');

    const serialised = JSON.stringify(await sealed(alice));

    expect(serialised).not.toContain('A sentence');
    expect(serialised).not.toMatch(/length|chars|size/i);
  });

  it('lists them in the order they open', async () => {
    await write(alice, dated(400));
    await write(alice, dated(100));

    expect((await sealed(alice)).map((letter) => letter.unlock_on)).toEqual([
      dated(100),
      dated(400),
    ]);
  });

  it('stops listing one once it has opened', async () => {
    await writeAlreadyOpen(alice, 'Opened already.', dated(-1));

    expect(await sealed(alice)).toEqual([]);
  });

  // SECURITY DEFINER, so this is the one function in the file where the
  // membership check is the function's own responsibility rather than RLS's.
  it("shows nothing of another person's sealed letters", async () => {
    const mallory = await createTestUser('mallory');
    await write(alice, dated(200), 'Hers.');

    expect(await sealed(mallory)).toEqual([]);

    await deleteTestUser(mallory);
  });
});

describe('the day it opens', () => {
  it('comes back once the date has passed', async () => {
    const id = await writeAlreadyOpen(alice, 'Here it is.', dated(-1));

    const { data } = await alice.client.from('future_messages').select('body').eq('id', id);

    expect(data?.[0]?.body).toEqual('Here it is.');
  });

  it('comes back on the day itself, not the day after', async () => {
    const id = await writeAlreadyOpen(alice, 'Today.', dated(0));

    const { data } = await alice.client.from('future_messages').select('body').eq('id', id);

    expect(data?.[0]?.body).toEqual('Today.');
  });

  it('opens through the function and returns the body', async () => {
    const id = await writeAlreadyOpen(alice, 'Dear me,', dated(-1));

    const opened = await open(alice, id);

    expect(opened[0]?.body).toEqual('Dear me,');
  });

  // Recorded by the database so it is a fact rather than a claim an app made.
  it('records when it was first read', async () => {
    const id = await writeAlreadyOpen(alice, 'Dear me,', dated(-1));

    expect((await open(alice, id))[0]?.unlocked_at).toEqual(expect.any(String));
  });

  it('keeps the first opening, not the most recent one', async () => {
    const id = await writeAlreadyOpen(alice, 'Dear me,', dated(-1));

    const first = (await open(alice, id))[0]?.unlocked_at;
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = (await open(alice, id))[0]?.unlocked_at;

    expect(second).toEqual(first);
  });

  it("refuses to open somebody else's letter", async () => {
    const mallory = await createTestUser('mallory');
    const id = await writeAlreadyOpen(alice, 'Hers.', dated(-1));

    expect(await open(mallory, id)).toEqual([]);

    await deleteTestUser(mallory);
  });

  it('returns nothing for an id that does not exist', async () => {
    expect(await open(alice, '00000000-0000-4000-8000-000000000000')).toEqual([]);
  });
});

describe('changing her mind', () => {
  const destroy = async (user: TestUser, id: string) => {
    const { data, error } = await user.client.rpc('destroy_future_message', { message_id: id });
    if (error !== null) throw error;
    return data as boolean;
  };

  // The escape hatch that does not break the seal: she can always decide not
  // to have written it, just not to read it early.
  it('can destroy a sealed letter unread', async () => {
    const id = await write(alice, dated(365), 'Never mind.');

    expect(await destroy(alice, id)).toBe(true);
    expect(await sealed(alice)).toEqual([]);
  });

  // The reason the escape hatch is a function at all. Postgres applies SELECT
  // policies to a DELETE that filters on the row, so an ordinary delete cannot
  // touch a sealed letter — the seal takes the plain route with it.
  it('is beyond the reach of an ordinary delete while sealed', async () => {
    const id = await write(alice, dated(365), 'Never mind.');

    const { error } = await alice.client.from('future_messages').delete().eq('id', id);

    expect(error).toBeNull();
    expect(await sealed(alice)).toHaveLength(1);

    await destroy(alice, id);
  });

  // And destroying is not a way of reading: a delete returning the row would
  // be the same hole as an update returning it.
  it('cannot read it on the way out', async () => {
    const id = await write(alice, dated(365), 'Never mind.');

    const { data } = await alice.client
      .from('future_messages')
      .delete()
      .eq('id', id)
      .select('body');

    expect(data ?? []).toEqual([]);
  });

  it('can delete a letter that has already opened, the ordinary way', async () => {
    const id = await writeAlreadyOpen(alice, 'Read and done with.', dated(-1));

    const { error } = await alice.client.from('future_messages').delete().eq('id', id);
    const { data } = await alice.client.from('future_messages').select('id').eq('id', id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("cannot destroy somebody else's", async () => {
    const mallory = await createTestUser('mallory');
    const id = await write(alice, dated(365), 'Hers.');

    const { data } = await mallory.client.rpc('destroy_future_message', { message_id: id });

    expect(data).toBe(false);
    expect(await sealed(alice)).toHaveLength(1);
    await deleteTestUser(mallory);
  });

  it('reports nothing destroyed for an id that does not exist', async () => {
    const { data } = await alice.client.rpc('destroy_future_message', {
      message_id: '00000000-0000-4000-8000-000000000000',
    });

    expect(data).toBe(false);
  });
});
