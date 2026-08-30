import * as SecureStore from 'expo-secure-store';

import { clearPin, currentCooldown, isPinSet, setPin, verifyPin } from '../pinStorage';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  // A real SHA-256 via node, not a stub. A stub that echoed its input would
  // make "never stores the PIN itself" pass or fail for the wrong reason —
  // the one-way-ness is exactly what that test is checking.
  digestStringAsync: jest.fn(async (_algorithm: string, data: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('node:crypto') as typeof import('node:crypto'))
      .createHash('sha256')
      .update(data)
      .digest('hex'),
  ),
  getRandomBytesAsync: jest.fn(async (length: number) => new Uint8Array(length).fill(7)),
}));

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(async () => {
  store.clear();
  jest.clearAllMocks();
  jest.useRealTimers();
});

const PIN = '135790';

describe('setting a PIN', () => {
  it('reports whether a lock is configured', async () => {
    expect(await isPinSet()).toBe(false);
    await setPin(PIN);
    expect(await isPinSet()).toBe(true);
  });

  it('never stores the PIN itself', async () => {
    await setPin(PIN);

    for (const value of store.values()) {
      expect(value).not.toContain(PIN);
    }
  });

  it('rejects anything that is not six digits', async () => {
    await expect(setPin('12345')).rejects.toThrow();
    await expect(setPin('1234567')).rejects.toThrow();
    await expect(setPin('12345a')).rejects.toThrow();
  });

  it('clears everything when the lock is turned off', async () => {
    await setPin(PIN);
    await clearPin();

    expect(await isPinSet()).toBe(false);
    expect(store.size).toBe(0);
  });
});

describe('verifying a PIN', () => {
  beforeEach(async () => {
    await setPin(PIN);
  });

  it('accepts the right PIN', async () => {
    expect((await verifyPin(PIN)).ok).toBe(true);
  });

  it('rejects the wrong PIN', async () => {
    expect((await verifyPin('000000')).ok).toBe(false);
  });

  it('rejects everything once the lock has been cleared', async () => {
    await clearPin();
    expect((await verifyPin(PIN)).ok).toBe(false);
  });
});

describe('attempt limiting', () => {
  beforeEach(async () => {
    await setPin(PIN);
  });

  it('counts down the remaining free attempts', async () => {
    expect((await verifyPin('000000')).attemptsRemaining).toBe(3);
    expect((await verifyPin('000000')).attemptsRemaining).toBe(2);
    expect((await verifyPin('000000')).attemptsRemaining).toBe(1);
    expect((await verifyPin('000000')).attemptsRemaining).toBe(0);
  });

  it('imposes a cooldown after repeated failures', async () => {
    for (let i = 0; i < 4; i += 1) await verifyPin('000000');

    const fifth = await verifyPin('000000');
    expect(fifth.cooldownSeconds).toBeGreaterThan(0);
  });

  it('escalates the cooldown as failures continue', async () => {
    for (let i = 0; i < 4; i += 1) await verifyPin('000000');

    const first = await verifyPin('000000');
    // Serve out the cooldown so the next attempt is actually evaluated.
    store.set('lock.attempts', JSON.stringify({ failures: 5, lockedUntil: Date.now() - 1 }));
    const second = await verifyPin('000000');

    expect(second.cooldownSeconds).toBeGreaterThan(first.cooldownSeconds);
  });

  it('refuses even the correct PIN while cooling down', async () => {
    for (let i = 0; i < 5; i += 1) await verifyPin('000000');

    const attempt = await verifyPin(PIN);
    expect(attempt.ok).toBe(false);
    expect(attempt.cooldownSeconds).toBeGreaterThan(0);
  });

  // An in-memory counter would be reset by force-quitting the app, making it
  // no obstacle at all. The state has to outlive the process.
  it('survives a restart, because the counter is persisted', async () => {
    for (let i = 0; i < 5; i += 1) await verifyPin('000000');

    expect(await currentCooldown()).toBeGreaterThan(0);
  });

  it('forgets past failures after a successful unlock', async () => {
    await verifyPin('000000');
    await verifyPin('000000');
    expect((await verifyPin(PIN)).ok).toBe(true);

    expect((await verifyPin('000000')).attemptsRemaining).toBe(3);
  });
});
