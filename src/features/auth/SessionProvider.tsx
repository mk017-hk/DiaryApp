import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
   * Signed in, but this phone could not be made ready for that account — the
   * device holds somebody's diary and it was not possible to settle whose.
   * Nothing is shown and nothing is synced until it is. See `prepareDevice`.
   */
  | 'blocked'
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

/** Lets every session through. What a provider with no device to prepare uses. */
const NOTHING_TO_PREPARE = (): Promise<boolean> => Promise.resolve(true);

export function SessionProvider({
  children,
  prepareDevice = NOTHING_TO_PREPARE,
}: {
  children: ReactNode;
  /**
   * Runs before a session is reported as signed in, and must resolve true for
   * it to be.
   *
   * This is where the phone is checked for somebody else's diary. It has to
   * happen *here*, before the status changes, rather than in a component
   * reacting to it: the moment the status reads signed-in, the sync engine
   * starts and the gate navigates to Today, and both would be reading a diary
   * that may not belong to the person now signed in.
   *
   * Injected rather than imported because the device module depends on the
   * entry, letter and media stores, all of which depend on this one.
   */
  prepareDevice?: (session: Session) => Promise<boolean>;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SessionStatus>(
    isSupabaseConfigured ? 'loading' : 'unavailable',
  );

  // Held in a ref so a new function identity from the parent does not tear
  // down the auth subscription and lose events in between.
  const prepareRef = useRef(prepareDevice);
  useEffect(() => {
    prepareRef.current = prepareDevice;
  }, [prepareDevice]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let cancelled = false;

    // Which account this device has already been made ready for in this run
    // of the app, so the hourly token refresh is a no-op rather than a storage
    // read. Cleared on sign-out: the next sign-in must be checked afresh.
    let preparedFor: string | null = null;

    // Only the most recent change may commit. Preparing can involve a wipe,
    // which takes time; a sign-out arriving meanwhile must not be overwritten
    // by the sign-in that started before it.
    let latest = 0;

    const apply = async (next: Session | null) => {
      const ticket = ++latest;

      if (next === null) {
        preparedFor = null;
        if (cancelled) return;
        setSession(null);
        setStatus('signed-out');
        return;
      }

      if (preparedFor !== next.user.id) {
        const ready = await prepareRef.current(next);
        if (cancelled || ticket !== latest) return;

        if (!ready) {
          setSession(null);
          setStatus('blocked');
          return;
        }

        preparedFor = next.user.id;
      }

      if (cancelled || ticket !== latest) return;
      setSession(next);
      setStatus('signed-in');
    };

    void auth.getSession().then(apply);
    const unsubscribe = auth.observeSession((next) => void apply(next));

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
