import type { Session, User } from '@supabase/supabase-js';

import { isSupabaseConfigured, startAuthAutoRefresh, supabase } from './client';
import { AppError, toAuthError, type AppError as AppErrorType } from './errors';

/**
 * Everything that talks to Supabase Auth.
 *
 * Screens call these and get either a value or an AppError with a message
 * already safe to render. A raw auth error names the provider, sometimes the
 * user's own email back at them, and occasionally whether an account exists —
 * none of which belongs on screen.
 */

export type AuthResult<T> = { ok: true; value: T } | { ok: false; error: AppErrorType };

const ok = <T>(value: T): AuthResult<T> => ({ ok: true, value });
const fail = (error: unknown, context: string): AuthResult<never> => ({
  ok: false,
  error: toAuthError(error, context),
});

/**
 * Guards every call below.
 *
 * Without credentials the client is pointed at an empty URL and every request
 * fails as a network error, which reads to the user as "your connection is
 * bad" when the truth is that this build has no backend. Say so instead.
 */
const NOT_CONFIGURED = new AppError('unknown', 'This build has no account service configured yet.');

export async function getSession(): Promise<Session | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Watches the session for as long as the app is open.
 *
 * One subscription for the whole app. It reports the session read from the
 * keychain at launch, every token refresh, sign-in and sign-out, and the
 * moment a refresh finally fails and the session is gone — so no screen has to
 * poll or guess. Token refresh is started alongside it and stopped by the
 * returned function, because a refresh timer with nobody listening is just
 * battery.
 *
 * `onChange` must not call back into auth: it runs inside the client's own
 * lock, and re-entering it there deadlocks.
 */
export function observeSession(onChange: (session: Session | null) => void): () => void {
  if (!isSupabaseConfigured) return () => undefined;

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    onChange(session);
  });
  const stopRefreshing = startAuthAutoRefresh();

  return () => {
    data.subscription.unsubscribe();
    stopRefreshing();
  };
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResult<{ user: User | null; needsConfirmation: boolean }>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED, 'sign up');

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // Read by the handle_new_user trigger, so the profile has a name from
      // the first moment rather than being patched a request later.
      options: { data: { display_name: displayName.trim() } },
    });

    if (error !== null) return fail(error, 'sign up');

    return ok({ user: data.user, needsConfirmation: data.session === null });
  } catch (error) {
    return fail(error, 'sign up');
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult<Session>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED, 'sign in');

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error !== null) return fail(error, 'sign in');
    if (data.session === null) return fail(new Error('no session returned'), 'sign in');

    return ok(data.session);
  } catch (error) {
    return fail(error, 'sign in');
  }
}

export async function signOut(): Promise<AuthResult<null>> {
  if (!isSupabaseConfigured) return ok(null);

  try {
    const { error } = await supabase.auth.signOut();
    if (error !== null) return fail(error, 'sign out');
    return ok(null);
  } catch (error) {
    return fail(error, 'sign out');
  }
}

export async function requestPasswordReset(email: string): Promise<AuthResult<null>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED, 'password reset');

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error !== null) return fail(error, 'password reset');
    return ok(null);
  } catch (error) {
    return fail(error, 'password reset');
  }
}

/**
 * Sign in with Apple.
 *
 * Apple requires this wherever another third-party sign-in is offered, and
 * this app will be reviewed carefully. It does not work in Expo Go — the
 * native module needs a development build — so callers check availability
 * first and hide the button rather than offering something that fails.
 */
export async function signInWithApple(
  identityToken: string,
  nonce?: string,
): Promise<AuthResult<Session>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED, 'apple sign in');

  try {
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      ...(nonce !== undefined ? { nonce } : {}),
    });

    if (error !== null) return fail(error, 'apple sign in');
    if (data.session === null) return fail(new Error('no session returned'), 'apple sign in');

    return ok(data.session);
  } catch (error) {
    return fail(error, 'apple sign in');
  }
}

/**
 * Deletes the account and everything in it.
 *
 * Removing an auth user needs the service role, which must never be in the
 * app, so this calls an Edge Function that verifies the caller's JWT and
 * deletes only its own user. Every table cascades from auth.users, and the
 * function clears storage objects before removing the row.
 *
 * Built now rather than at submission: the App Store requires it, and it is
 * far easier to write while the schema is small.
 */
export async function deleteAccount(): Promise<AuthResult<null>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED, 'delete account');

  try {
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error !== null) return fail(error, 'delete account');

    await supabase.auth.signOut();
    return ok(null);
  } catch (error) {
    return fail(error, 'delete account');
  }
}
