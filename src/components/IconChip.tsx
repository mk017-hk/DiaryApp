import { StyleSheet, View } from 'react-native';

import { space, useTheme, type Palette } from '@/design';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface IconChipProps {
  label: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
  /** The fill when selected. Period options use the period colour. */
  tone?: Extract<keyof Palette, 'accent' | 'period' | 'fertile'>;
  /** Radio-like groups announce as radios; multi-select ones as checkboxes. */
  single?: boolean;
  testID?: string;
}

/**
 * One option in the daily log: an icon in a circle, its name under it.
 *
 * Selection is shown three ways — the fill, a tick on the circle, and the
 * accessibility state — so it never rests on colour alone.
 */
export function IconChip({
  label,
  icon,
  selected,
  onPress,
  tone = 'accent',
  single = false,
  testID,
}: IconChipProps) {
  const theme = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      accessibilityRole={single ? 'radio' : 'checkbox'}
      accessibilityState={single ? { selected } : { checked: selected }}
      accessibilityLabel={label}
      style={styles.option}
      testID={testID}
    >
      <View
        style={[
          styles.circle,
          {
            backgroundColor: selected ? theme.colors[tone] : theme.colors.surface,
            borderColor: selected ? theme.colors[tone] : theme.colors.border,
          },
        ]}
      >
        <Icon name={icon} size={26} color={selected ? 'onAccent' : tone} />
        {selected && (
          <View
            style={[
              styles.tick,
              { backgroundColor: theme.colors.card, borderColor: theme.colors[tone] },
            ]}
          >
            <Icon name="check" size={12} color={tone} />
          </View>
        )}
      </View>
      <Text
        variant="caption"
        color={selected ? 'ink' : 'inkSecondary'}
        align="center"
        numberOfLines={2}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

const SIZE = 60;

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    borderRadius: SIZE / 2,
    borderWidth: 1,
    height: SIZE,
    justifyContent: 'center',
    width: SIZE,
  },
  option: { alignItems: 'center', gap: space.xxs, width: 76 },
  tick: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    top: -2,
    width: 20,
  },
});
