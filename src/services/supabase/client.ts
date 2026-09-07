import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { logger } from '@/services/logger';
import type { Database } from '@/types/database.generated';

import { secureStorageAdapter } from './secureStorageAdapter';

/**
 * The Supabase client.
 *
 * UI code must not import this directly — ESLint enforces that. Everything
 * goes through a repository in this folder, so data access stays testable and
 * swappable, and so no screen can quietly issue an unguarded query.
 *
 * Only the anon key is here. It is designed to ship inside a client and is
 * useless without a session because every table is behind RLS. The service
 * role key bypasses RLS entirely and must never appear in this bundle.
 */

interface SupabaseExtra {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as SupabaseExtra;

const supabaseUrl = extra.supabaseUrl ?? '';
const supabaseAnonKey = extra.supabaseAnonKey ?? '';

export const isSupabaseConfigured = supabaseUrl !== '' && supabaseAnonKey !== '';

/**
 * The project URL and anon key, for the one thing the SDK cannot do well.
 *
 * Uploading a video means streaming a file off disk. The storage client wants
 * the bytes in memory first, which for a two-minute clip is a hundred-odd
 * megabytes of JavaScript heap on a phone — so the media module posts to the
 * storage endpoint directly and lets the native layer stream it. It still
 * needs somewhere to post to, and the caller's own token.
 */
export const projectUrl = supabaseUrl;
export const publishableKey = supabaseAnonKey;

if (!isSupabaseConfigured) {
  // Deliberately not thrown. Throwing here would take down every screen at
  // import time, including ones that need no backend at all. Surfaces that do
  // need it check `isSupabaseConfigured` and explain themselves instead.
  logger.warn(
    'Supabase is not configured — copy .env.example to .env.local and set ' +
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY',
  );
}

/**
 * A stand-in URL for builds with no credentials.
 *
 * `createClient` throws on an empty URL, and it is called at import time, so an
 * unconfigured build would fail before a single screen rendered — including the
 * screens that need no backend at all. The diary has to keep working without
 * one: entries are local, and it is the only way to run in Expo Go without a
 * hosted project.
 *
 * Nothing is ever sent here. `.invalid` is reserved by RFC 2606 precisely so it
 * can never resolve, and the fetch below refuses before DNS would be asked.
 */
const PLACEHOLDER_URL = 'http://unconfigured.invalid';

/**
 * Refuses every request in an unconfigured build.
 *
 * Callers check `isSupabaseConfigured` first. This is what happens when one
 * forgets: an immediate, named failure instead of a request to a host that
 * does not exist, timing out somewhere far from the cause.
 */
const refuseAllRequests: typeof fetch = () =>
  Promise.reject(new Error('Supabase is not configured in this build'));

export const supabase = createClient<Database>(
  isSupabaseConfigured ? supabaseUrl : PLACEHOLDER_URL,
  isSupabaseConfigured ? supabaseAnonKey : 'unconfigured',
  {
    auth: {
      storage: secureStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // There are no URL sessions to detect in a native app, and leaving this on
      // makes the client parse window.location, which does not exist here.
      detectSessionInUrl: false,
    },
    ...(isSupabaseConfigured ? {} : { global: { fetch: refuseAllRequests } }),
  },
);

/**
 * Refresh tokens only while the app is in front.
 *
 * Left running in the background the timer wakes the app to no purpose and
 * drains battery; stopped entirely, the session expires while backgrounded and
 * the user returns to a sign-in screen holding a diary they were mid-way
 * through writing.
 */
export function startAuthAutoRefresh(): () => void {
  if (Platform.OS === 'web') return () => undefined;

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });

  if (AppState.currentState === 'active') {
    void supabase.auth.startAutoRefresh();
  }

  return () => {
    subscription.remove();
    void supabase.auth.stopAutoRefresh();
  };
}
