import {
  createEntry,
  createTestUser,
  createThread,
  deleteTestUser,
  type TestUser,
} from './helpers';

/**
 * Resurfacing, and every way of switching it off.
 *
 * These sit alongside the assistant context tests in consequence. A mistake
 * here does not leak anything to anyone — it hands someone a memory they
 * explicitly asked never to be handed, on a date they chose specifically
 * because of what it is. The worked example in the concept notes is a
 * miscarriage, and it is the right one to hold in mind while reading this file.
 *
 * So the tests are written as refusals rather than as filters: not "does the
 * query exclude it" but "given that she asked, does it stay away".
 *
 * Requires the local stack: npx supabase start
 */

jest.setTimeout(60_000);

let alice: TestUser;

interface Candidate {
  entry_id: string;
  entry_date: string;
  years_ago: number;
  body: string | null;
  thread_id: string | null;
}

const candidatesFor = async (user: TestUser, onDate: string): Promise<Candidate[]> => {
  const { data, error } = await user.client.rpc('resurfacing_candidates', { on_date: onDate });
  if (error !== null) throw error;
  return (data ?? []) as Candidate[];
};

const bodies = async (user: TestUser, onDate: string) =>
  (await candidatesFor(user, onDate)).map((row) => row.body);

/** The same day, in an earlier year. */
const yearsBefore = (isoDate: string, years: number) => {
  const [year, rest] = [isoDate.slice(0, 4), isoDate.slice(4)];
  return `${String(Number(year) - years)}${rest}`;
};

const mute = async (
  user: TestUser,
  range: { from: [number, number]; to: [number, number]; label?: string },
) => {
  const { data, error } = await user.client
    .from('resurfacing_mutes')
    .insert({
      diary_id: user.diaryId,
      created_by: user.user.id,
      from_month: range.from[0],
      from_day: range.from[1],
      to_month: range.to[0],
      to_day: range.to[1],
      ...(range.label === undefined ? {} : { label: range.label }),
    })
    .select('id')
    .single();

  if (error !== null) throw error;
  return data.id as string;
};

const clearMutes = async (user: TestUser) => {
  const { error } = await user.client
    .from('resurfacing_mutes')
    .delete()
    .eq('diary_id', user.diaryId);
  if (error !== null) throw error;
};

const clearEntries = async (user: TestUser) => {
  const { error } = await user.client.from('journal_entries').delete().eq('diary_id', user.diaryId);
  if (error !== null) throw error;
};

beforeAll(async () => {
  alice = await createTestUser('alice');
});

afterAll(async () => {
  await deleteTestUser(alice);
});

beforeEach(async () => {
  await clearEntries(alice);
  await clearMutes(alice);
});

describe('what comes back on an ordinary day', () => {
  const today = '2026-06-15';

  it('returns the same day from an earlier year', async () => {
    await createEntry(alice, { entry_date: yearsBefore(today, 2), body: 'Two years ago.' });

    expect(await bodies(alice, today)).toEqual(['Two years ago.']);
  });

  it('says how long ago it was, which is the whole point of the card', async () => {
    await createEntry(alice, { entry_date: yearsBefore(today, 3), body: 'Three.' });

    expect((await candidatesFor(alice, today))[0]?.years_ago).toEqual(3);
  });

  it('never returns today itself', async () => {
    await createEntry(alice, { entry_date: today, body: 'Written this morning.' });

    expect(await bodies(alice, today)).toEqual([]);
  });

  // A diary started in January has entries from earlier in the same year, and
  // "on this day" means another year, not another month.
  it('never returns an earlier day of this same year', async () => {
    await createEntry(alice, { entry_date: '2026-01-15', body: 'January, same year.' });

    expect(await bodies(alice, today)).toEqual([]);
  });

  it('ignores a different day of the same month', async () => {
    await createEntry(alice, { entry_date: '2024-06-14', body: 'A day out.' });

    expect(await bodies(alice, today)).toEqual([]);
  });

  it('returns several years at once, most recent first', async () => {
    await createEntry(alice, { entry_date: yearsBefore(today, 3), body: 'Oldest.' });
    await createEntry(alice, { entry_date: yearsBefore(today, 1), body: 'Newest.' });

    expect(await bodies(alice, today)).toEqual(['Newest.', 'Oldest.']);
  });

  it('never returns a deleted entry', async () => {
    await createEntry(alice, {
      entry_date: yearsBefore(today, 2),
      body: 'Deleted since.',
      deleted_at: new Date().toISOString(),
    });

    expect(await bodies(alice, today)).toEqual([]);
  });
});

describe('"do not hand this one back to me"', () => {
  const today = '2026-06-15';

  it('keeps an entry marked resurface_excluded away', async () => {
    await createEntry(alice, {
      entry_date: yearsBefore(today, 2),
      body: 'I keep this. Do not show it to me.',
      resurface_excluded: true,
    });

    expect(await bodies(alice, today)).toEqual([]);
  });

  // Two different sentences. Someone may want an entry reflected on but never
  // sprung on her, and the reverse is just as reasonable.
  it('is independent of ai_excluded in both directions', async () => {
    await createEntry(alice, {
      entry_date: yearsBefore(today, 2),
      body: 'Never read, fine to resurface.',
      ai_excluded: true,
    });
    await createEntry(alice, {
      entry_date: yearsBefore(today, 3),
      body: 'Fine to read, never resurface.',
      resurface_excluded: true,
    });

    expect(await bodies(alice, today)).toEqual(['Never read, fine to resurface.']);
  });

  it('still returns the other entries from that day', async () => {
    await createEntry(alice, {
      entry_date: yearsBefore(today, 2),
      body: 'Held back.',
      resurface_excluded: true,
    });
    await createEntry(alice, { entry_date: yearsBefore(today, 2), body: 'Fine.' });

    expect(await bodies(alice, today)).toEqual(['Fine.']);
  });
});

describe('"stop following this story up"', () => {
  const today = '2026-06-15';

  it('keeps every entry in a muted thread away', async () => {
    const thread = await createThread(alice);
    await alice.client.from('threads').update({ resurface_muted: true }).eq('id', thread);

    await createEntry(alice, {
      entry_date: yearsBefore(today, 2),
      body: 'Part of the story.',
      thread_id: thread,
    });

    expect(await bodies(alice, today)).toEqual([]);
  });

  // A thread hidden from the assistant may still be one she wants to remember.
  // Collapsing the two would quietly take memories away as the price of
  // privacy.
  it('does not mute a thread merely for being private', async () => {
    const thread = await createThread(alice, true);
    await createEntry(alice, {
      entry_date: yearsBefore(today, 2),
      body: 'Private, but mine to remember.',
      thread_id: thread,
    });

    expect(await bodies(alice, today)).toEqual(['Private, but mine to remember.']);
  });

  it('leaves entries outside the thread alone', async () => {
    const thread = await createThread(alice);
    await alice.client.from('threads').update({ resurface_muted: true }).eq('id', thread);

    await createEntry(alice, {
      entry_date: yearsBefore(today, 2),
      body: 'In the thread.',
      thread_id: thread,
    });
    await createEntry(alice, { entry_date: yearsBefore(today, 2), body: 'Not in it.' });

    expect(await bodies(alice, today)).toEqual(['Not in it.']);
  });

  it('resurfaces an entry with no thread at all', async () => {
    await createEntry(alice, { entry_date: yearsBefore(today, 2), body: 'Belongs to nothing.' });

    expect(await bodies(alice, today)).toEqual(['Belongs to nothing.']);
  });
});

describe('quiet dates', () => {
  it('returns nothing on a muted day, however much is there', async () => {
    await createEntry(alice, { entry_date: '2024-08-28', body: 'Something from that week.' });
    await createEntry(alice, { entry_date: '2023-08-28', body: 'And the year before.' });
    await mute(alice, { from: [8, 25], to: [8, 31] });

    expect(await bodies(alice, '2026-08-28')).toEqual([]);
  });

  it('is inclusive of both ends', async () => {
    await createEntry(alice, { entry_date: '2024-08-25', body: 'First day.' });
    await createEntry(alice, { entry_date: '2024-08-31', body: 'Last day.' });
    await mute(alice, { from: [8, 25], to: [8, 31] });

    expect(await bodies(alice, '2026-08-25')).toEqual([]);
    expect(await bodies(alice, '2026-08-31')).toEqual([]);
  });

  it('leaves the day either side of the range alone', async () => {
    await createEntry(alice, { entry_date: '2024-08-24', body: 'The day before.' });
    await createEntry(alice, { entry_date: '2024-09-01', body: 'The day after.' });
    await mute(alice, { from: [8, 25], to: [8, 31] });

    expect(await bodies(alice, '2026-08-24')).toEqual(['The day before.']);
    expect(await bodies(alice, '2026-09-01')).toEqual(['The day after.']);
  });

  // The reason the range is stored as month and day rather than as dates. A
  // mute set up to protect a due date must still be there the year after, and
  // the year after that.
  it('applies in every year, not only the one it was set in', async () => {
    await createEntry(alice, { entry_date: '2019-08-28', body: 'Long ago.' });
    await mute(alice, { from: [8, 25], to: [8, 31] });

    expect(await bodies(alice, '2031-08-28')).toEqual([]);
  });

  it('covers a range that wraps the new year', async () => {
    await createEntry(alice, { entry_date: '2024-12-29', body: 'End of December.' });
    await createEntry(alice, { entry_date: '2024-01-02', body: 'Start of January.' });
    await mute(alice, { from: [12, 28], to: [1, 3] });

    expect(await bodies(alice, '2026-12-29')).toEqual([]);
    expect(await bodies(alice, '2026-01-02')).toEqual([]);
  });

  it('leaves the middle of the year alone when the range wraps', async () => {
    await createEntry(alice, { entry_date: '2024-06-15', body: 'June.' });
    await mute(alice, { from: [12, 28], to: [1, 3] });

    expect(await bodies(alice, '2026-06-15')).toEqual(['June.']);
  });

  it('covers a single muted day', async () => {
    await createEntry(alice, { entry_date: '2024-03-04', body: 'That day.' });
    await mute(alice, { from: [3, 4], to: [3, 4] });

    expect(await bodies(alice, '2026-03-04')).toEqual([]);
  });

  it('honours several ranges at once', async () => {
    await createEntry(alice, { entry_date: '2024-03-04', body: 'March.' });
    await createEntry(alice, { entry_date: '2024-11-20', body: 'November.' });
    await mute(alice, { from: [3, 1], to: [3, 7] });
    await mute(alice, { from: [11, 18], to: [11, 22] });

    expect(await bodies(alice, '2026-03-04')).toEqual([]);
    expect(await bodies(alice, '2026-11-20')).toEqual([]);
  });

  it('starts resurfacing again once the mute is lifted', async () => {
    await createEntry(alice, { entry_date: '2024-03-04', body: 'That day.' });
    const id = await mute(alice, { from: [3, 1], to: [3, 7] });

    expect(await bodies(alice, '2026-03-04')).toEqual([]);

    await alice.client.from('resurfacing_mutes').delete().eq('id', id);

    expect(await bodies(alice, '2026-03-04')).toEqual(['That day.']);
  });

  // Nobody should have to write down why, on this subject of all subjects.
  it('does not require a reason', async () => {
    await expect(mute(alice, { from: [4, 1], to: [4, 2] })).resolves.toEqual(expect.any(String));
  });

  it('keeps a label when one is given', async () => {
    await mute(alice, { from: [4, 1], to: [4, 2], label: 'The week of the due date' });

    const { data } = await alice.client.from('resurfacing_mutes').select('label');

    expect(data?.[0]?.label).toEqual('The week of the due date');
  });
});

describe('the ranges the database refuses to store', () => {
  it('refuses a month outside the year', async () => {
    await expect(mute(alice, { from: [13, 1], to: [13, 2] })).rejects.toMatchObject({
      code: '23514',
    });
  });

  it('refuses a day outside the month', async () => {
    await expect(mute(alice, { from: [1, 0], to: [1, 5] })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(mute(alice, { from: [1, 1], to: [1, 32] })).rejects.toMatchObject({
      code: '23514',
    });
  });
});

describe('whose mutes they are', () => {
  it('refuses a mute attributed to somebody else', async () => {
    const mallory = await createTestUser('mallory');

    const { error } = await alice.client.from('resurfacing_mutes').insert({
      diary_id: alice.diaryId,
      created_by: mallory.user.id,
      from_month: 5,
      from_day: 1,
      to_month: 5,
      to_day: 2,
    });

    expect(error?.code).toEqual('42501');
    await deleteTestUser(mallory);
  });

  it('refuses a mute aimed at a diary the caller is not in', async () => {
    const mallory = await createTestUser('mallory');

    const { error } = await mallory.client.from('resurfacing_mutes').insert({
      diary_id: alice.diaryId,
      created_by: mallory.user.id,
      from_month: 5,
      from_day: 1,
      to_month: 5,
      to_day: 2,
    });

    expect(error?.code).toEqual('42501');
    await deleteTestUser(mallory);
  });

  // The function is SECURITY INVOKER, so this is RLS doing the work rather
  // than a `where` clause anybody could forget.
  it("shows one person nothing of another person's day", async () => {
    const mallory = await createTestUser('mallory');
    await createEntry(alice, { entry_date: '2024-06-15', body: "Alice's memory." });

    expect(await bodies(mallory, '2026-06-15')).toEqual([]);

    await deleteTestUser(mallory);
  });

  it("does not let one diary's mute silence another's memories", async () => {
    const mallory = await createTestUser('mallory');
    await mute(alice, { from: [6, 10], to: [6, 20] });
    await createEntry(mallory, { entry_date: '2024-06-15', body: "Mallory's memory." });

    expect(await bodies(mallory, '2026-06-15')).toEqual(["Mallory's memory."]);

    await deleteTestUser(mallory);
  });
});

describe('the range arithmetic on its own', () => {
  const within = async (
    check: [number, number],
    from: [number, number],
    to: [number, number],
  ): Promise<boolean> => {
    const { data, error } = await alice.client.rpc('date_within_mute', {
      check_month: check[0],
      check_day: check[1],
      from_month: from[0],
      from_day: from[1],
      to_month: to[0],
      to_day: to[1],
    });
    if (error !== null) throw error;
    return data as boolean;
  };

  it('handles an ordinary range', async () => {
    expect(await within([8, 28], [8, 25], [8, 31])).toBe(true);
    expect(await within([8, 24], [8, 25], [8, 31])).toBe(false);
    expect(await within([9, 1], [8, 25], [8, 31])).toBe(false);
  });

  it('handles a range spanning two months', async () => {
    expect(await within([9, 2], [8, 25], [9, 5])).toBe(true);
    expect(await within([8, 30], [8, 25], [9, 5])).toBe(true);
    expect(await within([9, 6], [8, 25], [9, 5])).toBe(false);
  });

  // The case most likely to be written backwards, and the reason this is its
  // own function rather than an expression inside the query.
  it('handles a range wrapping the new year', async () => {
    expect(await within([12, 29], [12, 28], [1, 3])).toBe(true);
    expect(await within([1, 2], [12, 28], [1, 3])).toBe(true);
    expect(await within([12, 27], [12, 28], [1, 3])).toBe(false);
    expect(await within([1, 4], [12, 28], [1, 3])).toBe(false);
    expect(await within([6, 15], [12, 28], [1, 3])).toBe(false);
  });

  it('handles a single day', async () => {
    expect(await within([3, 4], [3, 4], [3, 4])).toBe(true);
    expect(await within([3, 5], [3, 4], [3, 4])).toBe(false);
  });

  it('handles a leap day', async () => {
    expect(await within([2, 29], [2, 28], [3, 1])).toBe(true);
  });
});
