import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, fontAssets, useTheme } from '@/design';
import { SessionProvider, useSession } from '@/features/auth';
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
          <SessionProvider>
            <ProfileProvider>
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
            </ProfileProvider>
          </SessionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStack() {
  const theme = useTheme();
  const { ready, onboarded, adoptAccountName } = useProfile();
  const { status, accountName } = useSession();
  const segments = useSegments();
  const router = useRouter();

  const inOnboarding = segments[0] === 'onboarding';
  const inPublic = segments[0] === '(public)';

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
    if (!ready || status === 'loading') return;

    if (!onboarded) {
      if (!inOnboarding) router.replace('/onboarding');
      return;
    }

    if (status === 'signed-out') {
      if (!inPublic) router.replace('/welcome');
      return;
    }

    if (inPublic || inOnboarding) router.replace('/');
  }, [ready, onboarded, status, inOnboarding, inPublic, router]);

  // Nothing renders until both are known. A frame of the diary before the
  // redirect lands would show one person's entries to whoever is holding the
  // phone next.
  if (!ready || status === 'loading') return null;

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
      </Stack>
    </>
  );
}
