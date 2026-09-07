import { createEntry, createTestUser, deleteTestUser, type TestUser } from './helpers';

/**
 * Emotions on an entry.
 *
 * A join table rather than a column, so this is a second write that has to
 * survive the same things everything else does: another account cannot reach
 * it, a forged diary id is rejected by the database rather than by the client,
 * and replacing the set does not accumulate duplicates.
 *
 * Requires the local stack: npx supabase start
 */

jest.setTimeout(60_000);

let alice: TestUser;
let mallory: TestUser;
let entryId: string;
let emotionIds: Record<string, string>;

beforeAll(async () => {
  alice = await createTestUser('alice');
  mallory = await createTestUser('mallory');
  entryId = await createEntry(alice);

  const { data } = await alice.client.from('emotions').select('id, slug');
  emotionIds = Object.fromEntries(
    (data ?? []).map((row) => [row.slug as string, row.id as string]),
  );
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(mallory);
});

/** What `replaceEntryEmotions` does: clear, then insert the current set. */
async function setEmotions(user: TestUser, id: string, slugs: string[]) {
  await user.client.from('entry_emotions').delete().eq('entry_id', id);

  if (slugs.length === 0) return { error: null };

  return user.client.from('entry_emotions').insert(
    slugs.map((slug) => ({
      entry_id: id,
      diary_id: user.diaryId,
      emotion_id: emotionIds[slug],
    })),
  );
}

const slugsOn = async (user: TestUser, id: string) => {
  const { data } = await user.client
    .from('entry_emotions')
    .select('emotion_id, emotions(slug)')
    .eq('entry_id', id);

  return (data ?? [])
    .map((row) => (row.emotions as unknown as { slug: string } | null)?.slug)
    .filter((slug): slug is string => slug !== undefined)
    .sort();
};

describe('the vocabulary itself', () => {
  it('is readable by anyone signed in — it is not anybody’s data', async () => {
    const { data, error } = await mallory.client.from('emotions').select('slug');

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  // Entries store slugs, not ids: the ids are generated at seed time and differ
  // between a local stack and production, so a device holding one would break
  // the moment it pointed at a different project.
  it('has stable slugs to key entries by', async () => {
    expect(emotionIds.sad).toBeDefined();
    expect(emotionIds.grateful).toBeDefined();
  });
});

describe('putting emotions on an entry', () => {
  it('saves them and reads them back', async () => {
    const { error } = await setEmotions(alice, entryId, ['sad', 'lonely']);

    expect(error).toBeNull();
    expect(await slugsOn(alice, entryId)).toEqual(['lonely', 'sad']);
  });

  // Replace, not append. Naming a day differently a week later should change
  // what it says, not add to it.
  it('replaces the set rather than adding to it', async () => {
    await setEmotions(alice, entryId, ['sad', 'lonely']);
    await setEmotions(alice, entryId, ['grateful']);

    expect(await slugsOn(alice, entryId)).toEqual(['grateful']);
  });

  it('can clear them entirely', async () => {
    await setEmotions(alice, entryId, ['grateful']);
    await setEmotions(alice, entryId, []);

    expect(await slugsOn(alice, entryId)).toEqual([]);
  });

  it('refuses the same emotion twice on one entry', async () => {
    await setEmotions(alice, entryId, []);
    const { error } = await alice.client.from('entry_emotions').insert([
      { entry_id: entryId, diary_id: alice.diaryId, emotion_id: emotionIds.sad },
      { entry_id: entryId, diary_id: alice.diaryId, emotion_id: emotionIds.sad },
    ]);

    expect(error).not.toBeNull();
  });

  it('goes when the entry goes', async () => {
    const doomed = await createEntry(alice);
    await setEmotions(alice, doomed, ['anxious']);

    await alice.client.from('journal_entries').delete().eq('id', doomed);

    expect(await slugsOn(alice, doomed)).toEqual([]);
  });
});

describe('another account cannot reach them', () => {
  beforeAll(async () => {
    await setEmotions(alice, entryId, ['sad']);
  });

  it('cannot read what somebody else felt', async () => {
    const { data } = await mallory.client
      .from('entry_emotions')
      .select('emotion_id')
      .eq('entry_id', entryId);

    expect(data ?? []).toEqual([]);
  });

  it('cannot delete them', async () => {
    await mallory.client.from('entry_emotions').delete().eq('entry_id', entryId);

    expect(await slugsOn(alice, entryId)).toEqual(['sad']);
  });

  // The composite key is (entry_id, diary_id), so claiming somebody's entry
  // belongs to your diary is rejected by Postgres, not by application code.
  it('cannot attach one to an entry in another diary', async () => {
    const { error } = await mallory.client.from('entry_emotions').insert({
      entry_id: entryId,
      diary_id: mallory.diaryId,
      emotion_id: emotionIds.angry,
    });

    expect(error).not.toBeNull();
  });

  it('cannot smuggle one in by naming the real diary', async () => {
    const { error } = await mallory.client.from('entry_emotions').insert({
      entry_id: entryId,
      diary_id: alice.diaryId,
      emotion_id: emotionIds.angry,
    });

    expect(error).not.toBeNull();
    expect(await slugsOn(alice, entryId)).toEqual(['sad']);
  });
});
