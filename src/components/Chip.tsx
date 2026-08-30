import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Accent dot — used to carry emotion colour without colouring the label. */
  dotColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Selectable pill used for emotions and tags.
 *
 * Selection is signalled by tone and weight rather than a checkmark, and the
 * state is exposed to screen readers via `accessibilityState.selected` — colour
 * alone is never the only indicator.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  dotColor,
  disabled = false,
  style,
  testID,
}: ChipProps) {
  const theme = useTheme();

  const content = (
    <View style={styles.inner}>
      {dotColor !== undefined && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
      <Text variant="label" color={selected ? 'onAccent' : 'inkSecondary'} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  const containerStyle: StyleProp<ViewStyle> = [
    styles.base,
    {
      backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
      borderRadius: theme.radius.full,
      minHeight: theme.sizing.controlHeightSmall,
      paddingHorizontal: theme.space.md,
    },
    style,
  ];

  if (onPress === undefined) {
    return (
      <View style={containerStyle} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      haptic="selection"
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      style={containerStyle}
    >
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignSelf: 'flex-start', justifyContent: 'center' },
  dot: { borderRadius: 4, height: 8, width: 8 },
  inner: { alignItems: 'center', flexDirection: 'row', gap: 8 },
});
