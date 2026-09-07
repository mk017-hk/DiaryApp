import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { signInWithApple } from '@/services/supabase/auth';
import type { AuthResult } from '@/services/supabase/auth';
import { AppError } from '@/services/supabase/errors';
import { logger } from '@/services/logger';

/**
 * Sign in with Apple.
 *
 * App Review requires this on any iOS app offering another third-party
 * sign-in, and the privacy case is real: Apple's relay address means someone
 * can keep a diary without handing over an email at all.
 */

/**
 * Whether to show the button.
 *
 * Two conditions, and the second is the one that bites. In Expo Go the
 * credential comes back signed for Expo's own bundle identifier, not ours, so
 * Supabase rejects the token and the button looks broken. A development build
 * is where this can be tested — Phase 4 needs one anyway.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;

  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** The user closed the sheet. Not a failure, and not worth an error banner. */
export const APPLE_CANCELLED = 'apple_cancelled';

export interface AppleSignInOutcome {
  /** Apple sends the name once, on the very first authorization, or never again. */
  displayName: string;
}

export async function signInWithAppleFlow(): Promise<AuthResult<AppleSignInOutcome>> {
  try {
    // The nonce is sent to Apple hashed and to Supabase raw; Supabase hashes
    // it again and compares. Without it a stolen identity token could be
    // replayed into a session that was never authorized on this device.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (credential.identityToken === null) {
      return { ok: false, error: new AppError('unknown', 'Apple did not return a sign-in token.') };
    }

    const result = await signInWithApple(credential.identityToken, rawNonce);
    if (!result.ok) return result;

    // Apple gives the name on first authorization only. Missing it is normal
    // on every subsequent sign-in, so the caller falls back rather than asking.
    const given = credential.fullName?.givenName ?? '';
    return { ok: true, value: { displayName: given.trim() } };
  } catch (error) {
    if (isCancellation(error)) {
      return { ok: false, error: new AppError('validation', APPLE_CANCELLED) };
    }
    logger.error('apple sign in failed');
    return { ok: false, error: new AppError('unknown', 'Sign in with Apple could not complete.') };
  }
}

function isCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ERR_REQUEST_CANCELED'
  );
}
