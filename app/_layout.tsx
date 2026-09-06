import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, fontAssets, useTheme } from '@/design';
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
          <ProfileProvider>
            {/* The gate sits inside ThemeProvider so the lock screen is themed,
                and outside the navigator so no route renders while locked. */}
            <LockProvider>
              <LockGate>
                <ThemedStack />
              </LockGate>
            </LockProvider>
          </ProfileProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStack() {
  const theme = useTheme();
  const { ready, onboarded } = useProfile();
  const segments = useSegments();
  const router = useRouter();

  // Send first-time users to onboarding, and keep returning users out of it.
  useEffect(() => {
    if (!ready) return;

    const inOnboarding = segments[0] === 'onboarding';

    if (!onboarded && !inOnboarding) {
      router.replace('/onboarding');
    } else if (onboarded && inOnboarding) {
      router.replace('/');
    }
  }, [ready, onboarded, segments, router]);

  if (!ready) return null;

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
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen
          name="compose"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="entry/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="security" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}
