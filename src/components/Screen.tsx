import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design';

interface ScreenProps {
  children: ReactNode;
  /** Wraps content in a ScrollView. Off for screens that manage their own list. */
  scroll?: boolean;
  /** Applies the standard horizontal inset. Off for edge-to-edge media. */
  padded?: boolean;
  /** Which safe-area edges to respect. Tab screens usually skip the bottom. */
  edges?: { top?: boolean; bottom?: boolean };
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The page shell: canvas background, safe-area handling, standard insets.
 * Every route renders inside one so background and padding never drift.
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = { top: true, bottom: true },
  style,
  contentContainerStyle,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = {
    paddingTop: edges.top === true ? insets.top : 0,
    paddingBottom: edges.bottom === true ? insets.bottom : 0,
    paddingHorizontal: padded ? theme.screenPadding : 0,
  };

  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={[styles.fill, { backgroundColor: theme.colors.canvas }, style]}
        contentContainerStyle={[padding, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View
      testID={testID}
      style={[styles.fill, { backgroundColor: theme.colors.canvas }, padding, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
