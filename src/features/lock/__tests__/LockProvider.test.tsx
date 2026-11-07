import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { LockProvider, useAppLock } from '../LockProvider';

/**
 * The lock, with the app state changes a phone really sends.
 *
 * Reproduces the loop reported with the timeout set to "Immediately": Face ID
 * unlocks the app, its prompt closing looks like a return to the app, and the
 * app locks again — which shows the lock screen, which asks for Face ID.
 */

const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: () => Promise.resolve(true),
  getItemAsync: (key: string) => Promise.resolve(mockStore.get(key) ?? null),
  setItemAsync: (key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  },
  deleteItemAsync: (key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  },
}));

let emit: (next: AppStateStatus) => void = () => undefined;

beforeEach(() => {
  mockStore.clear();
  // A PIN is set, and the timeout is "Immediately".
  mockStore.set('lock.pin.hash', 'hash');
  mockStore.set('lock.pin.salt', 'salt');
  mockStore.set('lock.timeout', 'immediately');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    emit = listener as (next: AppStateStatus) => void;
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

let lock: ReturnType<typeof useAppLock> | null = null;
function Probe() {
  const current = useAppLock();
  // Handed out from an effect, not during render, so rendering stays pure.
  useEffect(() => {
    lock = current;
  });
  return null;
}

async function start() {
  await render(
    <LockProvider>
      <Probe />
    </LockProvider>,
  );
  // Let the stored settings load.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const state = () => lock?.state;

it('starts locked when a PIN is set', async () => {
  await start();
  expect(state()).toBe('locked');
});

it('stays unlocked after Face ID, with the timeout on "Immediately"', async () => {
  await start();

  // The lock screen asks for Face ID: the system prompt makes the app
  // inactive, Face ID succeeds, and the prompt closes.
  await act(async () => emit('inactive'));
  await act(async () => lock?.unlockWithBiometrics());
  await act(async () => emit('active'));

  expect(state()).toBe('unlocked');
});

it('stays unlocked when the prompt closes before the unlock lands', async () => {
  await start();
  await act(async () => emit('inactive'));
  await act(async () => emit('active'));
  await act(async () => lock?.unlockWithBiometrics());
  expect(state()).toBe('unlocked');
});

it('stays unlocked through a permission prompt or a pull of the notification shade', async () => {
  await start();
  await act(async () => lock?.unlockWithBiometrics());
  await act(async () => emit('inactive'));
  await act(async () => emit('active'));
  expect(state()).toBe('unlocked');
});

it('still locks the moment she leaves the app and comes back, on "Immediately"', async () => {
  await start();
  await act(async () => lock?.unlockWithBiometrics());
  await act(async () => emit('inactive'));
  await act(async () => emit('background'));
  await act(async () => emit('active'));
  expect(state()).toBe('locked');
});

it('waits out a longer timeout before locking', async () => {
  mockStore.set('lock.timeout', '1m');
  await start();
  await act(async () => lock?.unlockWithBiometrics());

  const now = jest.spyOn(Date, 'now');
  now.mockReturnValue(1_000_000);
  await act(async () => emit('background'));
  now.mockReturnValue(1_030_000);
  await act(async () => emit('active'));
  expect(state()).toBe('unlocked');

  now.mockReturnValue(2_000_000);
  await act(async () => emit('background'));
  now.mockReturnValue(2_061_000);
  await act(async () => emit('active'));
  expect(state()).toBe('locked');
});
