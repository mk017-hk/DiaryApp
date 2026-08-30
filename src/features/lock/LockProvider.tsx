import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { logger } from '@/services/logger';

import { clearPin, isLockSupported, isPinSet, setPin as persistPin, verifyPin } from './pinStorage';

/**
 * App lock state.
 *
 * `checking` exists so the app never flashes a diary before it knows whether a
 * lock is configured — a single unlocked frame is a real leak when someone is
 * watching over your shoulder.
 */
export type LockState = 'checking' | 'disabled' | 'locked' | 'unlocked';

/** How long the app may sit in the background before it locks again. */
export type LockTimeout = 'immediately' | '1m' | '5m' | '15m';

const TIMEOUT_MS: Record<LockTimeout, number> = {
  immediately: 0,
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
};

const TIMEOUT_KEY = 'lock.timeout';
const BIOMETRICS_KEY = 'lock.biometrics';

interface LockContextValue {
  state: LockState;
  timeout: LockTimeout;
  biometricsEnabled: boolean;
  enableLock: (pin: string) => Promise<void>;
  disableLock: () => Promise<void>;
  unlockWithPin: (
    pin: string,
  ) => Promise<{ ok: boolean; cooldownSeconds: number; attemptsRemaining: number }>;
  unlockWithBiometrics: () => void;
  lockNow: () => void;
  setTimeout: (value: LockTimeout) => Promise<void>;
  setBiometricsEnabled: (value: boolean) => Promise<void>;
}

const LockContext = createContext<LockContextValue | null>(null);

export function LockProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LockState>('checking');
  const [timeout, setTimeoutState] = useState<LockTimeout>('immediately');
  const [biometricsEnabled, setBiometricsState] = useState(true);

  // Held in a ref rather than state: it is written from an AppState listener
  // and read on the next foreground, and must not trigger a re-render.
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // No secure storage means no PIN can ever have been set, so there is
        // nothing to unlock. Distinct from a failed read, which fails closed.
        if (!(await isLockSupported())) {
          if (!cancelled) setState('disabled');
          return;
        }

        const [configured, storedTimeout, storedBiometrics] = await Promise.all([
          isPinSet(),
          SecureStore.getItemAsync(TIMEOUT_KEY),
          SecureStore.getItemAsync(BIOMETRICS_KEY),
        ]);

        if (cancelled) return;

        if (storedTimeout !== null && storedTimeout in TIMEOUT_MS) {
          setTimeoutState(storedTimeout as LockTimeout);
        }
        setBiometricsState(storedBiometrics !== 'false');
        setState(configured ? 'locked' : 'disabled');
      } catch (error) {
        logger.error('Could not restore lock settings', { error });
        // Fail closed: if we cannot tell whether a lock exists, ask for it.
        if (!cancelled) setState('locked');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;

        if (since === null) return;

        setState((current) => {
          if (current !== 'unlocked') return current;
          return Date.now() - since >= TIMEOUT_MS[timeout] ? 'locked' : current;
        });
        return;
      }

      // 'inactive' fires for the app switcher and for system prompts. Record
      // the moment either way; the timeout decides on return.
      backgroundedAt.current ??= Date.now();
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [timeout]);

  const enableLock = useCallback(async (pin: string) => {
    await persistPin(pin);
    setState('unlocked');
  }, []);

  const disableLock = useCallback(async () => {
    await clearPin();
    setState('disabled');
  }, []);

  const unlockWithPin = useCallback(async (pin: string) => {
    const result = await verifyPin(pin);
    if (result.ok) setState('unlocked');
    return result;
  }, []);

  const unlockWithBiometrics = useCallback(() => {
    setState('unlocked');
  }, []);

  const lockNow = useCallback(() => {
    setState((current) => (current === 'disabled' ? current : 'locked'));
  }, []);

  const setTimeout = useCallback(async (value: LockTimeout) => {
    setTimeoutState(value);
    await SecureStore.setItemAsync(TIMEOUT_KEY, value);
  }, []);

  const setBiometricsEnabled = useCallback(async (value: boolean) => {
    setBiometricsState(value);
    await SecureStore.setItemAsync(BIOMETRICS_KEY, value ? 'true' : 'false');
  }, []);

  const value = useMemo<LockContextValue>(
    () => ({
      state,
      timeout,
      biometricsEnabled,
      enableLock,
      disableLock,
      unlockWithPin,
      unlockWithBiometrics,
      lockNow,
      setTimeout,
      setBiometricsEnabled,
    }),
    [
      state,
      timeout,
      biometricsEnabled,
      enableLock,
      disableLock,
      unlockWithPin,
      unlockWithBiometrics,
      lockNow,
      setTimeout,
      setBiometricsEnabled,
    ],
  );

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useAppLock(): LockContextValue {
  const context = useContext(LockContext);
  if (context === null) throw new Error('useAppLock must be used inside a <LockProvider>');
  return context;
}
