import { useEffect, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View, type AppStateStatus } from 'react-native';

import { Text } from '@/components';
import { useTheme } from '@/design';

/**
 * Hides the app when it leaves the foreground.
 *
 * iOS screenshots the current frame for the app switcher, and that image sits
 * in the snapshot cache. Without this, flicking through open apps in front of
 * someone shows them whatever entry was on screen — the lock would be beside
 * the point, since it only engages on return.
 *
 * Renders on `inactive` too, which is what fires as the switcher opens.
 */
export function PrivacyCover({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => setObscured(next !== 'active');
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.fill}>
      {children}
      {obscured && (
        <View
          style={[styles.cover, { backgroundColor: theme.colors.canvas }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text variant="title3" color="inkTertiary">
            Diary
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { flex: 1 },
});
