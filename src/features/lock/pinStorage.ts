import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { logger } from '@/services/logger';

/**
 * App PIN storage.
 *
 * The PIN is deliberately *not* the device passcode. The threat this feature
 * exists for is someone close to you picking up your unlocked phone — and that
 * person often knows your phone passcode. A separate PIN is the only thing that
 * actually stops them.
 *
 * What this protects, honestly: it gates the app on this device. It is not
 * encryption, and it does not defend against someone who knows your account
 * password, who can simply sign in elsewhere. That is also why forgetting the
 * PIN is recoverable by signing out and back in — the PIN guards the door, the
 * account password guards the data.
 *
 * On hashing: the PIN is salted and hashed once, and the digest lives in the
 * OS keychain. Iterating the hash would be theatre here — expo-crypto's digest
 * is async and bridge-bound, so a realistic iteration count buys a couple of
 * orders of magnitude against a six-digit space that is only 10^6 wide. The
 * defences that actually work are the keychain holding the digest and the
 * persistent attempt limiter below.
 */

const PIN_HASH_KEY = 'lock.pin.hash';
const PIN_SALT_KEY = 'lock.pin.salt';
const ATTEMPTS_KEY = 'lock.attempts';

export const PIN_LENGTH = 6;

/** Cooldown after each failure past the threshold, in seconds. */
const COOLDOWN_LADDER = [30, 60, 300, 900, 3600];
const FREE_ATTEMPTS = 4;

interface AttemptState {
  failures: number;
  lockedUntil: number | null;
}

const NO_ATTEMPTS: AttemptState = { failures: 0, lockedUntil: null };

async function hashPin(pin: string, saltHex: string): Promise<string> {
  return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${saltHex}:${pin}`);
}

// Attempts are persisted rather than held in memory: an in-memory counter is
// reset by force-quitting the app, which makes it no obstacle at all.
async function readAttempts(): Promise<AttemptState> {
  try {
    const raw = await SecureStore.getItemAsync(ATTEMPTS_KEY);
    if (raw === null) return NO_ATTEMPTS;
    const parsed = JSON.parse(raw) as Partial<AttemptState>;
    return {
      failures: typeof parsed.failures === 'number' ? parsed.failures : 0,
      lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : null,
    };
  } catch {
    return NO_ATTEMPTS;
  }
}

async function writeAttempts(state: AttemptState): Promise<void> {
  await SecureStore.setItemAsync(ATTEMPTS_KEY, JSON.stringify(state));
}

/**
 * Whether the platform can hold a PIN at all.
 *
 * Distinct from "reading it failed". If there is no secure storage — the web
 * build, say — then no PIN was ever set, and demanding one would lock the user
 * out of an app they never locked. A read that fails on a platform that *does*
 * have secure storage is a different matter, and the caller fails closed.
 */
export async function isLockSupported(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function isPinSet(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PIN_HASH_KEY)) !== null;
  } catch (error) {
    logger.error('Could not read lock state', { error });
    return false;
  }
}

export async function setPin(pin: string): Promise<void> {
  if (!/^\d+$/.test(pin) || pin.length !== PIN_LENGTH) {
    throw new Error(`PIN must be ${String(PIN_LENGTH)} digits`);
  }

  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const saltHex = Array.from(saltBytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  await SecureStore.setItemAsync(PIN_SALT_KEY, saltHex);
  await SecureStore.setItemAsync(PIN_HASH_KEY, await hashPin(pin, saltHex));
  await writeAttempts(NO_ATTEMPTS);
}

export async function clearPin(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(PIN_HASH_KEY),
    SecureStore.deleteItemAsync(PIN_SALT_KEY),
    SecureStore.deleteItemAsync(ATTEMPTS_KEY),
  ]);
}

export interface VerifyResult {
  ok: boolean;
  /** Seconds remaining before another attempt is allowed. */
  cooldownSeconds: number;
  attemptsRemaining: number;
}

export async function verifyPin(pin: string): Promise<VerifyResult> {
  const attempts = await readAttempts();
  const now = Date.now();

  if (attempts.lockedUntil !== null && attempts.lockedUntil > now) {
    return {
      ok: false,
      cooldownSeconds: Math.ceil((attempts.lockedUntil - now) / 1000),
      attemptsRemaining: 0,
    };
  }

  const [storedHash, saltHex] = await Promise.all([
    SecureStore.getItemAsync(PIN_HASH_KEY),
    SecureStore.getItemAsync(PIN_SALT_KEY),
  ]);

  if (storedHash === null || saltHex === null) {
    return { ok: false, cooldownSeconds: 0, attemptsRemaining: 0 };
  }

  if ((await hashPin(pin, saltHex)) === storedHash) {
    await writeAttempts(NO_ATTEMPTS);
    return { ok: true, cooldownSeconds: 0, attemptsRemaining: FREE_ATTEMPTS };
  }

  const failures = attempts.failures + 1;
  const overage = failures - FREE_ATTEMPTS;
  const cooldownSeconds =
    overage > 0 ? (COOLDOWN_LADDER[Math.min(overage - 1, COOLDOWN_LADDER.length - 1)] ?? 0) : 0;

  await writeAttempts({
    failures,
    lockedUntil: cooldownSeconds > 0 ? now + cooldownSeconds * 1000 : null,
  });

  return {
    ok: false,
    cooldownSeconds,
    attemptsRemaining: Math.max(0, FREE_ATTEMPTS - failures),
  };
}

/** Seconds until another attempt is allowed, or 0. */
export async function currentCooldown(): Promise<number> {
  const { lockedUntil } = await readAttempts();
  if (lockedUntil === null) return 0;
  return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
}
