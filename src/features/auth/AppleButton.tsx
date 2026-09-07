import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components';
import { space } from '@/design';
import { useProfile } from '@/features/profile';

import { APPLE_CANCELLED, isAppleSignInAvailable, signInWithAppleFlow } from './appleSignIn';

interface AppleButtonProps {
  /** Called with a message to show; called with null to clear one. */
  onError: (message: string | null) => void;
}

/**
 * Sign in with Apple, or nothing at all.
 *
 * It renders only where it can actually succeed — not on Android, not on the
 * web, and not in Expo Go, where Apple signs the credential for Expo's bundle
 * identifier rather than ours. A button that always fails is worse than no
 * button, and this one is checked by App Review.
 */
export function AppleButton({ onError }: AppleButtonProps) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const { onboarded, adoptAccountName } = useProfile();

  useEffect(() => {
    let cancelled = false;
    void isAppleSignInAvailable().then((result) => {
      if (!cancelled) setAvailable(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;

  const run = async () => {
    onError(null);
    setBusy(true);
    const result = await signInWithAppleFlow();
    setBusy(false);

    if (result.ok) {
      // Apple hands over the name once, on the first authorization ever. If
      // this is that moment and the device has no profile yet, it is the only
      // chance to learn it without asking.
      if (!onboarded) await adoptAccountName(result.value.displayName);
      return;
    }

    // Closing the sheet is a choice, not a failure worth a red banner.
    if (result.error.userMessage !== APPLE_CANCELLED) onError(result.error.userMessage);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.divider}>
        <Text variant="caption" color="inkFaint">
          or
        </Text>
      </View>
      <Button
        label="Continue with Apple"
        variant="secondary"
        onPress={() => void run()}
        loading={busy}
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { alignItems: 'center', paddingVertical: space.xxs },
  wrap: { gap: space.xxs },
});
