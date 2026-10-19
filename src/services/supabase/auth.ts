import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

import { parseAuthLink } from '@/features/auth/authLink';
import { logger } from '@/services/logger';

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

/**
 * Where a link in an email brings somebody back to.
 *
 * `diary://auth/callback` in a real build; `exp://…/--/auth/callback` in Expo
 * Go. Built at call time rather than as a constant because Expo Go's address
 * depends on the machine serving it.
 *
 * Supabase only honours a redirect it has been told to allow. A URL missing
 * from the project's allow list is silently replaced with the site URL, and
 * the email then opens a web page instead of the app — the commonest way for
 * this to break on going live, and why GOING_LIVE.md lists the exact entries.
 */
export function authRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

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
      options: {
        // Read by the handle_new_user trigger, so the profile has a name from
        // the first moment rather than being patched a request later.
        data: { display_name: displayName.trim() },
        // With confirmation on, the email's link comes back into the app and
        // signs them in, rather than landing on a web page that does nothing.
        emailRedirectTo: authRedirectUrl(),
      },
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
    // Without this the reset link opens the site URL in a browser, and there is
    // nowhere there to type a new password. The app has to be where it lands.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl(),
    });
    if (error !== null) return fail(error, 'password reset');
    return ok(null);
  } catch (error) {
    return fail(error, 'password reset');
  }
}

/** What following a link from an email turned out to be. */
export type AuthLinkOutcome =
  /** Signed in — a confirmed sign-up, or a magic link. */
  | 'signed-in'
  /** Signed in for the sole purpose of choosing a new password. */
  | 'recovery'
  /** The route was opened with nothing to complete. */
  | 'nothing';

const LINK_EXPIRED = new AppError(
  'validation',
  'That link has expired or has already been used — each one works once. Ask for a new one.',
);

/**
 * PKCE's one real limitation, said plainly.
 *
 * The code in the link is useless without a verifier stored on the phone that
 * asked for the email. Opened anywhere else — a laptop, a second phone, or this
 * phone after the app was deleted and reinstalled — it cannot be completed.
 * A sign-up is still confirmed either way; signing in with the password works.
 */
const LINK_ELSEWHERE = new AppError(
  'validation',
  'That link could not be used here. Open it on the phone you asked for it from, or ask for a new one.',
);

/**
 * Completes a link from an email.
 *
 * Whether the result is a password reset is decided by what is stored on this
 * phone where possible, not by what is in the URL: for a PKCE code, auth-js
 * records the request as a recovery when the reset was asked for, and reports
 * it back on exchange. A link cannot talk its way into the set-password
 * screen.
 */
export async function completeAuthLink(url: string): Promise<AuthResult<AuthLinkOutcome>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED, 'auth link');

  const link = parseAuthLink(url);

  try {
    switch (link.kind) {
      case 'empty':
        return ok('nothing');

      case 'failed':
        return { ok: false, error: link.reason === 'expired' ? LINK_EXPIRED : LINK_ELSEWHERE };

      case 'code': {
        const { data, error } = await supabase.auth.exchangeCodeForSession(link.code);
        if (error !== null) {
          logger.warn('Could not exchange an email link', { code: error.code });
          return { ok: false, error: LINK_ELSEWHERE };
        }
        // Returned at runtime and shown in auth-js's own doc example, but
        // missing from its declared type. Read narrowly here; the reset-flow
        // integration test is what catches a version that stops sending it.
        const { redirectType } = data as typeof data & { redirectType?: string | null };
        return ok(redirectType === 'recovery' ? 'recovery' : 'signed-in');
      }

      case 'otp': {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: link.tokenHash,
          type: link.type,
        });
        if (error !== null) return { ok: false, error: LINK_EXPIRED };
        return ok(link.type === 'recovery' ? 'recovery' : 'signed-in');
      }

      case 'tokens': {
        const { error } = await supabase.auth.setSession({
          access_token: link.accessToken,
          refresh_token: link.refreshToken,
        });
        if (error !== null) return { ok: false, error: LINK_EXPIRED };
        return ok(link.recovery ? 'recovery' : 'signed-in');
      }
    }
  } catch (error) {
    return fail(error, 'auth link');
  }
}

/**
 * Sets a new password, from the screen a recovery link opens.
 *
 * Then signs out every other session. Somebody resetting a password may be
 * doing it because they think someone else has the old one, and leaving that
 * person signed in would make the reset decorative. The other phones are the
 * owner's own in the ordinary case, and lose nothing: the diary on each stays
 * where it is, tied to this account, and comes back on the next sign-in.
 */
export async function setNewPassword(password: string): Promise<AuthResult<null>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED, 'set password');

  try {
    const { error } = await supabase.auth.updateUser({ password });

    if (error !== null) {
      if (error.code === 'same_password') {
        return {
          ok: false,
          error: new AppError(
            'validation',
            'That is the password you already have. Choose another.',
          ),
        };
      }
      return fail(error, 'set password');
    }

    // The password has changed whether or not this succeeds, so a failure
    // here is logged rather than reported as the whole thing failing.
    const { error: othersError } = await supabase.auth.signOut({ scope: 'others' });
    if (othersError !== null) {
      logger.warn('Password changed, but other sessions could not be signed out', {
        code: othersError.code,
      });
    }

    return ok(null);
  } catch (error) {
    return fail(error, 'set password');
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
