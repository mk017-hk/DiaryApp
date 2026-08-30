import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, fontAssets, useTheme } from '@/design';
import { LockGate, LockProvider } from '@/features/lock';
import { logger } from '@/services/logger';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  const onReady = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  if (fontError !== null) {
    // The app is still usable with system fonts, so this is not fatal — but it
    // means the typography is wrong, which we want to know about.
    logger.warn('Font loading failed; falling back to system fonts');
  }

  if (!fontsLoaded && fontError === null) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onReady}>
      <SafeAreaProvider>
        <ThemeProvider>
          {/* The gate sits inside ThemeProvider so the lock screen is themed,
              and outside the navigator so no route can render while locked. */}
          <LockProvider>
            <LockGate>
              <ThemedStack />
            </LockGate>
          </LockProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStack() {
  const theme = useTheme();

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.canvas },
          animation: 'slide_from_right',
        }}
      />
    </>
  );
}
