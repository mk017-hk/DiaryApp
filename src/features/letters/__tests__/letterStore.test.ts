import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  applyRemoteLetters,
  forgetLetter,
  isOpenable,
  keepOpened,
  listLetters,
  markSealed,
  stillOnThisPhone,
  unsentLetters,
  writeLetter,
} from '../letterStore';

/**
 * Letters on the device.
 *
 * One test here matters more than the rest: that the body actually leaves
 * storage once the account has it. Everything else about this feature — the
 * policy, the functions, the copy on the screen — is undone if the plaintext
 * is still sitting in AsyncStorage for anyone who picks the phone up.
 */

jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: () => `letter-${String(++counter)}` };
});

/** What is actually on disk, rather than what the API hands back. */
const raw = async (): Promise<string> => (await AsyncStorage.getItem('letters.v1')) ?? '';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('writing one', () => {
  it('keeps it, with the day it opens', async () => {
    const letter = await writeLetter({ body: 'Dear you,', unlockOn: '2027-06-15' });

    expect(letter.unlockOn).toEqual('2027-06-15');
    expect((await listLetters())[0]?.id).toEqual(letter.id);
  });

  // There is nowhere else it could be before the first sync, and the screen
  // says so rather than claiming it is sealed already.
  it('is honest that it is still on this phone until it is sent', async () => {
    const letter = await writeLetter({ body: 'Dear you,', unlockOn: '2027-06-15' });

    expect(stillOnThisPhone(letter)).toBe(true);
  });

  it('queues it to be sent', async () => {
    await writeLetter({ body: 'Dear you,', unlockOn: '2027-06-15' });

    expect(await unsentLetters()).toHaveLength(1);
  });

  it('lists the soonest to open first', async () => {
    await writeLetter({ body: 'Later.', unlockOn: '2030-01-01' });
    await writeLetter({ body: 'Sooner.', unlockOn: '2027-01-01' });

    expect((await listLetters()).map((letter) => letter.unlockOn)).toEqual([
      '2027-01-01',
      '2030-01-01',
    ]);
  });
});

/**
 * The moment the seal becomes real.
 *
 * Until the account has the letter, "sealed" is something the interface says.
 * After it does, the body has to be gone from here — and gone from the bytes on
 * disk, not merely absent from whatever the store chooses to return.
 */
describe('once the account has it', () => {
  it('drops the body from storage entirely', async () => {
    const letter = await writeLetter({
      body: 'THE SECRET SENTENCE',
      unlockOn: '2027-06-15',
    });

    await markSealed([letter.id]);

    expect(await raw()).not.toContain('THE SECRET SENTENCE');
  });

  it('keeps the fact of the letter and when it opens', async () => {
    const letter = await writeLetter({ body: 'Dear you,', unlockOn: '2027-06-15' });

    await markSealed([letter.id]);

    const kept = (await listLetters())[0];
    expect(kept?.id).toEqual(letter.id);
    expect(kept?.unlockOn).toEqual('2027-06-15');
    expect(kept?.body).toBeUndefined();
  });

  it('stops saying it is still on this phone', async () => {
    const letter = await writeLetter({ body: 'Dear you,', unlockOn: '2027-06-15' });

    await markSealed([letter.id]);

    expect(stillOnThisPhone((await listLetters())[0]!)).toBe(false);
  });

  it('stops queueing it to be sent again', async () => {
    const letter = await writeLetter({ body: 'Dear you,', unlockOn: '2027-06-15' });

    await markSealed([letter.id]);

    expect(await unsentLetters()).toEqual([]);
  });

  // A pass that only got some of them through must not drop the bodies of the
  // ones still waiting, or they would be sealed nowhere at all.
  it('leaves a letter the account did not accept alone', async () => {
    const sent = await writeLetter({ body: 'Accepted.', unlockOn: '2027-06-15' });
    await writeLetter({ body: 'STILL WAITING', unlockOn: '2027-07-15' });

    await markSealed([sent.id]);

    expect(await raw()).toContain('STILL WAITING');
    expect(await unsentLetters()).toHaveLength(1);
  });
});

describe('the day it opens', () => {
  it('is openable on the day itself', () => {
    const letter = { id: 'l', unlockOn: '2026-06-15', createdAt: '2025-01-01T00:00:00.000Z' };

    expect(isOpenable(letter, '2026-06-15')).toBe(true);
  });

  it('is openable after it', () => {
    const letter = { id: 'l', unlockOn: '2026-06-15', createdAt: '2025-01-01T00:00:00.000Z' };

    expect(isOpenable(letter, '2026-06-16')).toBe(true);
  });

  it('is not openable the day before', () => {
    const letter = { id: 'l', unlockOn: '2026-06-15', createdAt: '2025-01-01T00:00:00.000Z' };

    expect(isOpenable(letter, '2026-06-14')).toBe(false);
  });

  it('keeps what was read, so it need not be fetched twice', async () => {
    const letter = await writeLetter({ body: 'Dear you,', unlockOn: '2026-06-15' });
    await markSealed([letter.id]);

    await keepOpened(letter.id, {
      body: 'Dear you,',
      unlockedAt: '2026-06-15T09:00:00.000Z',
    });

    const kept = (await listLetters())[0];
    expect(kept?.body).toEqual('Dear you,');
    expect(kept?.unlockedAt).toEqual('2026-06-15T09:00:00.000Z');
  });
});

describe('letters written on another phone', () => {
  it('appears as a fact with no contents', async () => {
    await applyRemoteLetters([
      { id: 'elsewhere', unlockOn: '2028-01-01', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const letters = await listLetters();
    expect(letters).toHaveLength(1);
    expect(letters[0]?.body).toBeUndefined();
  });

  // The account's sealed list is only the sealed ones, so a letter drops off it
  // the moment its day arrives. Treating absence as deletion would make every
  // letter vanish on exactly the morning it was written for.
  it('does not delete a letter just because it is no longer sealed', async () => {
    await applyRemoteLetters([
      { id: 'opens-today', unlockOn: '2026-06-15', createdAt: '2025-01-01T00:00:00.000Z' },
    ]);

    await applyRemoteLetters([]);

    expect(await listLetters()).toHaveLength(1);
  });

  it('does not overwrite a body this phone is still holding', async () => {
    const letter = await writeLetter({ body: 'NOT YET SENT', unlockOn: '2027-06-15' });

    await applyRemoteLetters([
      { id: letter.id, unlockOn: '2027-06-15', createdAt: letter.createdAt },
    ]);

    expect(await raw()).toContain('NOT YET SENT');
    expect(await unsentLetters()).toHaveLength(1);
  });
});

describe('changing her mind', () => {
  it('forgets a letter, body and all', async () => {
    const letter = await writeLetter({ body: 'NEVER MIND', unlockOn: '2027-06-15' });

    await forgetLetter(letter.id);

    expect(await listLetters()).toEqual([]);
    expect(await raw()).not.toContain('NEVER MIND');
  });
});
