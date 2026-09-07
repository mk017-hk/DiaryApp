import { Stack } from 'expo-router';

import { useTheme } from '@/design';

/**
 * The screens you can reach without an account.
 *
 * Grouped so the session guard in the root layout can ask one question —
 * "is this route public?" — rather than keeping a list of screen names in
 * step with the filesystem.
 */
export default function PublicLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.canvas },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
