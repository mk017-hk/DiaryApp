import * as SecureStore from 'expo-secure-store';

import { secureStorageAdapter } from '../secureStorageAdapter';

/**
 * SecureStore rejects values over 2048 bytes and a Supabase session exceeds
 * that. The failure mode is silent — the write is dropped and the user is
 * signed out on next launch with no error anywhere — so the chunking is
 * pinned here.
 */

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      if (value.length > 2048) throw new Error('Value too large for SecureStore');
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
});

const KEY = 'sb-session';

describe('secureStorageAdapter', () => {
  it('round-trips a session far larger than the 2048-byte limit', async () => {
    const session = 'x'.repeat(9000);

    await secureStorageAdapter.setItem(KEY, session);

    expect(await secureStorageAdapter.getItem(KEY)).toEqual(session);
  });

  it('never writes a single value over the platform limit', async () => {
    await secureStorageAdapter.setItem(KEY, 'y'.repeat(9000));

    for (const value of store.values()) {
      expect(value.length).toBeLessThanOrEqual(2048);
    }
  });

  it('returns null when nothing is stored', async () => {
    expect(await secureStorageAdapter.getItem(KEY)).toBeNull();
  });

  it('round-trips a short session too', async () => {
    await secureStorageAdapter.setItem(KEY, 'small');
    expect(await secureStorageAdapter.getItem(KEY)).toEqual('small');
  });

  it('does not leave stale chunks when a shorter session replaces a longer one', async () => {
    await secureStorageAdapter.setItem(KEY, 'a'.repeat(9000));
    await secureStorageAdapter.setItem(KEY, 'b'.repeat(100));

    // Reading back must not splice trailing chunks of the old session onto
    // the new one — that would yield a corrupt token rather than a clean one.
    expect(await secureStorageAdapter.getItem(KEY)).toEqual('b'.repeat(100));
  });

  it('discards a torn write rather than returning a partial session', async () => {
    await secureStorageAdapter.setItem(KEY, 'c'.repeat(9000));
    store.delete(`${KEY}.2`); // simulate a chunk lost mid-write

    expect(await secureStorageAdapter.getItem(KEY)).toBeNull();

    // And it cleans up after itself, so the next read is not misled again.
    expect(store.size).toEqual(0);
  });

  it('clears every chunk on sign-out', async () => {
    await secureStorageAdapter.setItem(KEY, 'd'.repeat(9000));
    await secureStorageAdapter.removeItem(KEY);

    expect(store.size).toEqual(0);
    expect(await secureStorageAdapter.getItem(KEY)).toBeNull();
  });

  it('survives a SecureStore failure without throwing into the auth client', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain locked'));

    await expect(secureStorageAdapter.setItem(KEY, 'value')).resolves.toBeUndefined();
  });
});
