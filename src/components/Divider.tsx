import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design';

interface DividerProps {
  /** Vertical breathing room around the line. */
  spacing?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A hairline. Used sparingly — space separates content better than lines do,
 * and a screen full of rules is what makes an app look like a settings panel.
 */
export function Divider({ spacing, style }: DividerProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          backgroundColor: theme.colors.border,
          height: StyleSheet.hairlineWidth,
          marginVertical: spacing ?? theme.space.md,
        },
        style,
      ]}
    />
  );
}
