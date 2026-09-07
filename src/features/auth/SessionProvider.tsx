import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import * as auth from '@/services/supabase/auth';
import type { AuthResult } from '@/services/supabase/auth';
import { isSupabaseConfigured } from '@/services/supabase/client';

/**
 * Who is signed in, for the whole app.
 *
 * The session itself lives in the keychain, written by the chunked SecureStore
 * adapter — this only holds the in-memory copy React renders from, and keeps
 * it in step with the client via `onAuthStateChange`. A token refresh, a sign
 * out on another screen and an expired session all arrive through that one
 * subscription rather than each screen guessing.
 */

export type SessionStatus =
  /** Still reading the stored session. Nothing should render yet. */
  | 'loading'
  | 'signed-in'
  | 'signed-out'
  /**
   * No Supabase credentials in this build. Not an error: the diary runs
   * locally without a backend, and gating it behind a sign-in screen that
   * cannot possibly succeed would make the app untestable.
   */
  | 'unavailable';

interface SessionContextValue {
  status: SessionStatus;
  session: Session | null;
  user: User | null;
  /** The name on the account, if it has one. Empty string, never undefined. */
  accountName: string;
  signIn: (email: string, password: string) => Promise<AuthResult<Session>>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<AuthResult<{ needsConfirmation: boolean }>>;
  signOut: () => Promise<AuthResult<null>>;
  requestPasswordReset: (email: string) => Promise<AuthResult<null>>;
  deleteAccount: () => Promise<AuthResult<null>>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** The display name the account was created with, as carried in the JWT. */
function nameFrom(session: Session | null): string {
  if (session === null) return '';
  const metadata = session.user.user_metadata as Record<string, unknown>;
  const name = metadata.display_name ?? metadata.full_name ?? metadata.name;
  return typeof name === 'string' ? name.trim() : '';
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SessionStatus>(
    isSupabaseConfigured ? 'loading' : 'unavailable',
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let cancelled = false;

    const apply = (next: Session | null) => {
      if (cancelled) return;
      setSession(next);
      setStatus(next === null ? 'signed-out' : 'signed-in');
    };

    void auth.getSession().then(apply);
    const unsubscribe = auth.observeSession(apply);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
    ): Promise<AuthResult<{ needsConfirmation: boolean }>> => {
      const result = await auth.signUp(email, password, displayName);
      if (!result.ok) return result;
      // With email confirmation on there is no session yet, and the caller
      // shows "check your inbox" rather than waiting for a redirect that the
      // auth subscription will deliver whenever the link is followed.
      return { ok: true, value: { needsConfirmation: result.value.needsConfirmation } };
    },
    [],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      accountName: nameFrom(session),
      signIn: auth.signIn,
      signUp,
      signOut: auth.signOut,
      requestPasswordReset: auth.requestPasswordReset,
      deleteAccount: auth.deleteAccount,
    }),
    [status, session, signUp],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (context === null) throw new Error('useSession must be used inside a <SessionProvider>');
  return context;
}
