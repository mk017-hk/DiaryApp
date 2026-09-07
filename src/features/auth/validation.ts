/**
 * Form checks for the auth screens.
 *
 * Deliberately forgiving. These exist to catch a typo before it costs a
 * round-trip, not to lecture: the server is the authority on whether an email
 * is real and whether a password is strong enough, and a client-side rule that
 * disagrees with it only produces a form that refuses input the backend would
 * have accepted.
 */

/**
 * Not RFC 5322 — nothing practical is. This rejects the mistakes people
 * actually make (no @, no dot, a trailing space) and lets everything else
 * through to the server, which knows better.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Eight, matching what Supabase is configured to require.
 *
 * No composition rules — no forced symbol, no forced digit. They push people
 * towards `Password1!` and away from the long passphrase that is actually
 * harder to guess, and this app already offers a device lock for the threat
 * that matters most here, which is somebody picking up the phone.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function emailError(email: string): string | undefined {
  const trimmed = email.trim();
  if (trimmed.length === 0) return 'Please enter your email.';
  if (!EMAIL.test(trimmed)) return 'That email address doesn’t look right.';
  return undefined;
}

export function passwordError(password: string): string | undefined {
  if (password.length === 0) return 'Please choose a password.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Please use at least ${String(MIN_PASSWORD_LENGTH)} characters.`;
  }
  return undefined;
}

/** Sign-in only: any password may be the right one, so only emptiness is wrong. */
export function signInPasswordError(password: string): string | undefined {
  if (password.length === 0) return 'Please enter your password.';
  return undefined;
}
