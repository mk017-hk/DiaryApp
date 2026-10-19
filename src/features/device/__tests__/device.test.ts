import AsyncStorage from '@react-native-async-storage/async-storage';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { claimOwner, decideOwnership, forgetOwner, readOwner } from '../owner';
import { prepareDeviceFor } from '../prepare';
import { ACCOUNT_KEYS, DEVICE_KEYS, wipeDiaryFromDevice } from '../wipe';

/**
 * Whose diary is on this phone.
 *
 * The case these tests exist for: a session ends without anybody tapping Sign
 * out — an account deleted from another phone, a password reset elsewhere —
 * and then a different person signs in on this one. Before this, they were
 * shown the previous person's diary, and the sync engine uploaded the previous
 * person's unsent entries into the new person's account.
 */

// The file-backed stores. Their own tests cover what they do on disk; here the
// question is only whether the wipe asks them to.
const mockDeleteAllRecordings = jest.fn(async () => undefined);
const mockDeleteAllCaptured = jest.fn();
const mockClearArchive = jest.fn();
const mockForgetSignedUrls = jest.fn();

jest.mock('@/features/media', () => ({
  deleteAllRecordings: () => mockDeleteAllRecordings(),
  deleteAllCaptured: () => mockDeleteAllCaptured(),
}));
jest.mock('@/features/export', () => ({ clearArchive: () => mockClearArchive() }));
jest.mock('@/services/supabase/media', () => ({ forgetSignedUrls: () => mockForgetSignedUrls() }));

// The entry and letter barrels pull in screens and providers; the stores
// themselves are all this needs.
jest.mock('@/features/entries', () => ({
  ...jest.requireActual('@/features/entries/entryStore'),
  ...jest.requireActual('@/features/entries/threadStore'),
  ...jest.requireActual('@/features/entries/muteStore'),
}));
jest.mock('@/features/letters', () => jest.requireActual('@/features/letters/letterStore'));

const ALICE = 'aaaaaaaa-0000-4000-8000-000000000001';
const BOB = 'bbbbbbbb-0000-4000-8000-000000000002';

/** Alice's diary, as it would sit on her phone. */
const seedAlicesDiary = async () => {
  await AsyncStorage.multiSet([
    ['entries.v1', JSON.stringify([{ id: 'e1', body: 'ALICE PRIVATE', unsynced: true }])],
    ['entries.watermark.v1', '2026-10-01T00:00:00.000Z'],
    ['threads.v1', JSON.stringify([{ id: 't1', title: 'ALICE THREAD' }])],
    ['resurfacingMutes.v1', JSON.stringify([{ id: 'm1', label: 'ALICE DUE DATE' }])],
    ['letters.v1', JSON.stringify([{ id: 'l1', body: 'ALICE LETTER' }])],
    ['profile.v1', JSON.stringify({ name: 'Alice' })],
    ['lock.pin.hash', 'hash'],
    ['lock.timeout', '60'],
  ]);
  await claimOwner(ALICE);
};

const everything = async () => {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet(keys);
  return Object.fromEntries(pairs);
};

const noProfileChange = async () => undefined;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('deciding', () => {
  it('leaves a diary with the person it belongs to', () => {
    expect(decideOwnership(ALICE, ALICE)).toEqual('mine');
  });

  it('lets the first account on a device claim it', () => {
    expect(decideOwnership(null, ALICE)).toEqual('claim');
  });

  it('wipes when somebody else signs in', () => {
    expect(decideOwnership(ALICE, BOB)).toEqual('wipe');
  });
});

describe('remembering', () => {
  it('records who owns the device', async () => {
    await claimOwner(ALICE);

    expect(await readOwner()).toEqual(ALICE);
  });

  it('forgets on request', async () => {
    await claimOwner(ALICE);
    await forgetOwner();

    expect(await readOwner()).toBeNull();
  });
});

describe('Alice signs back in on her own phone', () => {
  it('touches nothing', async () => {
    await seedAlicesDiary();

    expect(await prepareDeviceFor(ALICE, { replaceProfile: noProfileChange })).toBe(true);
    expect(JSON.stringify(await everything())).toContain('ALICE PRIVATE');
  });
});

describe('the first sign-in on a phone', () => {
  // Including a phone upgrading from a build that never recorded an owner: the
  // diary there is, in every ordinary case, the signed-in person's.
  it('claims the device and keeps what is there', async () => {
    await AsyncStorage.setItem('entries.v1', JSON.stringify([{ id: 'e1', body: 'MINE' }]));

    expect(await prepareDeviceFor(ALICE, { replaceProfile: noProfileChange })).toBe(true);
    expect(await readOwner()).toEqual(ALICE);
    expect(JSON.stringify(await everything())).toContain('MINE');
  });
});

/**
 * The case the whole module exists for.
 */
describe('Bob signs in on a phone holding Alice’s diary', () => {
  it('removes every trace of hers before he is let in', async () => {
    await seedAlicesDiary();

    await prepareDeviceFor(BOB, { replaceProfile: noProfileChange });

    const left = JSON.stringify(await everything());
    expect(left).not.toContain('ALICE');
  });

  // The upload half of the bug. An entry still marked unsynced, on a device
  // now signed in as Bob, would be pushed with Bob as its author.
  it('leaves none of her unsent entries to be uploaded as his', async () => {
    await seedAlicesDiary();

    await prepareDeviceFor(BOB, { replaceProfile: noProfileChange });

    expect(await AsyncStorage.getItem('entries.v1')).toBeNull();
  });

  it('removes her recordings, photos, voice notes and exported copy too', async () => {
    await seedAlicesDiary();

    await prepareDeviceFor(BOB, { replaceProfile: noProfileChange });

    expect(mockDeleteAllRecordings).toHaveBeenCalled();
    expect(mockDeleteAllCaptured).toHaveBeenCalled();
    expect(mockClearArchive).toHaveBeenCalled();
    expect(mockForgetSignedUrls).toHaveBeenCalled();
  });

  it('replaces the profile, so he is not greeted by her name', async () => {
    await seedAlicesDiary();
    const replaceProfile = jest.fn(async () => undefined);

    await prepareDeviceFor(BOB, { replaceProfile });

    expect(replaceProfile).toHaveBeenCalledTimes(1);
  });

  it('then records the device as his', async () => {
    await seedAlicesDiary();

    expect(await prepareDeviceFor(BOB, { replaceProfile: noProfileChange })).toBe(true);
    expect(await readOwner()).toEqual(BOB);
  });

  // The lock guards the phone, not the account. Clearing it because the account
  // changed would hand an unlocked phone to whoever caused the change.
  it('leaves the app lock alone', async () => {
    await seedAlicesDiary();

    await prepareDeviceFor(BOB, { replaceProfile: noProfileChange });

    expect(await AsyncStorage.getItem('lock.pin.hash')).toEqual('hash');
    expect(await AsyncStorage.getItem('lock.timeout')).toEqual('60');
  });

  it('does not wipe again the next time he opens the app', async () => {
    await seedAlicesDiary();
    await prepareDeviceFor(BOB, { replaceProfile: noProfileChange });
    await AsyncStorage.setItem('entries.v1', JSON.stringify([{ id: 'b1', body: 'BOB WROTE' }]));
    jest.clearAllMocks();

    await prepareDeviceFor(BOB, { replaceProfile: noProfileChange });

    expect(mockDeleteAllRecordings).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('entries.v1')).toContain('BOB WROTE');
  });
});

/**
 * Failing closed, in both directions.
 */
describe('when it cannot be settled', () => {
  // Claiming after a partial wipe would declare the leftovers his, and the
  // next launch would have no reason to try again.
  it('does not claim the device if the wipe was incomplete', async () => {
    await seedAlicesDiary();
    mockDeleteAllRecordings.mockRejectedValueOnce(new Error('disk said no'));

    expect(await prepareDeviceFor(BOB, { replaceProfile: noProfileChange })).toBe(false);
    expect(await readOwner()).not.toEqual(BOB);
  });

  // Wiping on a storage read that did not work could cost the rightful owner
  // the entries they had not sent yet. Unknown is answered by doing nothing.
  it('destroys nothing if it cannot tell whose the diary is', async () => {
    await seedAlicesDiary();
    const spy = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('locked'));

    expect(await prepareDeviceFor(BOB, { replaceProfile: noProfileChange })).toBe(false);
    spy.mockRestore();
    expect(JSON.stringify(await everything())).toContain('ALICE PRIVATE');
  });
});

/**
 * Completeness.
 *
 * The wipe used to live inline on the account screen, which is how the
 * exported copy came to be left behind on sign-out: a store added later, and
 * a list in one place nobody went back to. These fail when a future feature
 * adds a storage key without deciding which side of the line it is on.
 */
describe('nothing is left behind by omission', () => {
  const declaredKeys = (): string[] => {
    const root = path.resolve(__dirname, '../../..');
    const found: string[] = [];

    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (name === '__tests__' || name === 'node_modules') continue;
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) {
          const source = fs.readFileSync(full, 'utf8');
          for (const match of source.matchAll(/^const [A-Z_]*KEY[A-Z_]* = '([^']+)'/gm)) {
            found.push(match[1] as string);
          }
        }
      }
    };

    walk(root);
    return found;
  };

  it('finds the keys it is meant to be checking', () => {
    // A guard on the guard: if the scan matched nothing, every assertion below
    // would pass vacuously.
    expect(declaredKeys()).toEqual(expect.arrayContaining(['entries.v1', 'lock.pin.hash']));
  });

  it('classifies every storage key the app declares', () => {
    const classified = new Set<string>([...ACCOUNT_KEYS, ...DEVICE_KEYS]);
    const unclassified = declaredKeys().filter((key) => !classified.has(key));

    expect(unclassified).toEqual([]);
  });

  it('clears every key that holds somebody’s diary', async () => {
    await AsyncStorage.multiSet(ACCOUNT_KEYS.map((key) => [key, 'SOMEONE ELSE']));

    // The profile goes through its provider in the app; here, straight to disk.
    await wipeDiaryFromDevice({
      resetProfile: () => AsyncStorage.removeItem('profile.v1'),
    });

    const left = await AsyncStorage.multiGet([...ACCOUNT_KEYS]);
    expect(left.filter(([, value]) => value !== null)).toEqual([]);
  });
});
