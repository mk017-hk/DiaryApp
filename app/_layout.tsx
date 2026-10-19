import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Text } from '@/components';
import { ThemeProvider, fontAssets, space, useTheme } from '@/design';
import { SessionProvider, useSession } from '@/features/auth';
import { prepareDeviceFor } from '@/features/device';
import { PendingConsent } from '@/features/assistant';
import { SyncProvider } from '@/features/entries';
import { LockGate, LockProvider } from '@/features/lock';
import { ProfileProvider, useProfile } from '@/features/profile';
import { logger } from '@/services/logger';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  const onReady = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  if (fontError !== null) {
    logger.warn('Font loading failed; falling back to system fonts');
  }

  if (!fontsLoaded && fontError === null) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onReady}>
      <SafeAreaProvider>
        <ThemeProvider>
          {/* The profile sits outside the session now, so that a different
              account signing in can have the previous person's name and
              preferences replaced before it is reported as signed in. */}
          <ProfileProvider>
            <SessionWithDevice>
              {/* The lock is the outermost gate, and deliberately so: it guards
                  the device, and there are entries on this device whether or
                  not a session is currently valid. Auth is a redirect inside
                  the navigator instead. The two answer different questions —
                  is there an account, and may this person open it — and are
                  kept apart on purpose. */}
              <LockProvider>
                <LockGate>
                  {/* Inside the gate: a sync that ran while the app was
                      locked would be work nobody asked for, on a phone that
                      may not be in its owner's hands. */}
                  <SyncProvider>
                    {/* Renders nothing. Delivers the answer onboarding took
                        before there was an account to record it against. */}
                    <PendingConsent />
                    <ThemedStack />
                  </SyncProvider>
                </LockGate>
              </LockProvider>
            </SessionWithDevice>
          </ProfileProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * The session, made to wait until this phone's diary belongs to whoever is
 * signing in.
 *
 * Where a different account is signing in, the previous person's diary is
 * wiped and the profile replaced with the new account's name — in one step, so
 * that there is no moment where the app shows an empty profile and sends the
 * new person back through onboarding.
 */
function SessionWithDevice({ children }: { children: ReactNode }) {
  const { adoptAccountName, reset } = useProfile();

  const prepareDevice = useCallback(
    (session: Session) =>
      prepareDeviceFor(session.user.id, {
        replaceProfile: async () => {
          const metadata = session.user.user_metadata as Record<string, unknown>;
          const name = metadata.display_name ?? metadata.full_name ?? metadata.name;
          if (typeof name === 'string' && name.trim().length > 0) {
            await adoptAccountName(name);
          } else {
            await reset();
          }
        },
      }),
    [adoptAccountName, reset],
  );

  return <SessionProvider prepareDevice={prepareDevice}>{children}</SessionProvider>;
}

function ThemedStack() {
  const theme = useTheme();
  const { ready, onboarded, adoptAccountName } = useProfile();
  const { status, accountName } = useSession();
  const segments = useSegments();
  const router = useRouter();

  const inOnboarding = segments[0] === 'onboarding';
  const inPublic = segments[0] === '(public)';
  // Links from emails. Reachable signed out (a confirmation, before the link is
  // read), signed in (a reset, after it is), and before onboarding (a reset
  // tapped on a phone the app was just reinstalled on). The gate stays out of
  // the way until the screen itself moves on.
  const inAuthLink = segments[0] === 'auth';

  /*
   * Someone signing in on a new phone has an account but nothing stored here.
   * Their name is in the account, so take it rather than marching them back
   * through "what should I call you?" for a question already answered.
   */
  useEffect(() => {
    if (!ready || onboarded) return;
    if (status !== 'signed-in' || accountName === '') return;
    void adoptAccountName(accountName);
  }, [ready, onboarded, status, accountName, adoptAccountName]);

  /*
   * Three gates, in order. Onboarding comes before sign-up on purpose: the
   * first thing anyone meets should be the diary asking their name, not a
   * form asking for credentials for a thing they have not seen yet.
   *
   * `unavailable` means this build has no Supabase credentials. The diary
   * still works — entries are local until Phase 2 — so it is let through
   * rather than parked on a sign-in screen that cannot succeed.
   */
  useEffect(() => {
    if (!ready || status === 'loading' || status === 'blocked') return;
    if (inAuthLink) return;

    if (!onboarded) {
      if (!inOnboarding) router.replace('/onboarding');
      return;
    }

    if (status === 'signed-out') {
      if (!inPublic) router.replace('/welcome');
      return;
    }

    if (inPublic || inOnboarding) router.replace('/');
  }, [ready, onboarded, status, inOnboarding, inPublic, inAuthLink, router]);

  // Nothing renders until both are known. A frame of the diary before the
  // redirect lands would show one person's entries to whoever is holding the
  // phone next.
  if (!ready || status === 'loading') return null;

  // Somebody's diary is on this phone and it was not possible to settle whose.
  // Neither shown nor destroyed; a relaunch tries again.
  if (status === 'blocked') {
    return (
      <View style={[styles.blocked, { backgroundColor: theme.colors.canvas }]}>
        <Text variant="title3" align="center">
          This phone could not be got ready for your diary.
        </Text>
        <Text variant="callout" color="inkSecondary" align="center">
          Nothing has been lost. Close the app completely and open it again.
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.canvas },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(public)" options={{ animation: 'fade' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen
          name="compose"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="entry/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="thread/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="account" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="security" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="support" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="auth/callback" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth/reset-password" options={{ animation: 'fade' }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  blocked: { flex: 1, gap: space.sm, justifyContent: 'center', paddingHorizontal: space.lg },
});
