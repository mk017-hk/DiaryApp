import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type Palette } from '@/design';

import { PressableScale } from './PressableScale';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** A palette token for the fill. Cards are white on paper unless told otherwise. */
  tone?: Extract<keyof Palette, 'card' | 'surface' | 'accentWash' | 'periodWash' | 'fertileWash'>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A raised, rounded panel.
 *
 * The main unit of the redesigned screens: Today, Insights and You are lists of
 * these. Lifted by a wide, faint, warm shadow rather than a border, which is
 * what keeps a screen of them soft instead of boxed.
 */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  tone = 'card',
  style,
  testID,
}: CardProps) {
  const theme = useTheme();
  const surface: StyleProp<ViewStyle> = [
    styles.base,
    {
      backgroundColor: theme.colors[tone],
      borderRadius: theme.radius.lg,
      padding: theme.space.md,
    },
    tone === 'card' && theme.scheme === 'light' ? theme.elevation.soft : null,
    tone === 'card' && theme.scheme === 'dark'
      ? { borderColor: theme.colors.border, borderWidth: StyleSheet.hairlineWidth }
      : null,
    style,
  ];

  if (onPress === undefined) {
    return (
      <View style={surface} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      accessibilityRole="button"
      {...(accessibilityLabel !== undefined ? { accessibilityLabel } : {})}
      style={surface}
      testID={testID}
    >
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'visible' },
});
