import { StyleSheet, View } from 'react-native';

import { space, useTheme } from '@/design';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface StepperProps {
  label: string;
  /** Undefined reads as "not logged", which is different from zero. */
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  step?: number;
  min?: number;
  max?: number;
  /** "glasses", "hours". */
  unit: string;
  /** Where the first tap of + lands when nothing is logged yet. */
  start?: number;
}

/**
 * A number, nudged up or down.
 *
 * Not logged is its own state, shown as a dash and reached by stepping below
 * the minimum — so "I didn't log water" and "I drank none" stay different
 * things in the data.
 */
export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 99,
  unit,
  start,
}: StepperProps) {
  const theme = useTheme();

  const down = () => {
    if (value === undefined) return;
    const next = value - step;
    onChange(next < min ? undefined : next);
  };
  const up = () => {
    if (value === undefined) {
      onChange(start ?? min);
      return;
    }
    onChange(Math.min(max, value + step));
  };

  const shown = value === undefined ? '—' : `${String(value)} ${unit}`;

  return (
    <View style={styles.row}>
      <Text variant="bodyMedium" style={styles.label}>
        {label}
      </Text>
      <PressableScale
        onPress={down}
        haptic="selection"
        disabled={value === undefined}
        accessibilityLabel={`Less ${label.toLowerCase()}`}
        style={[styles.button, { backgroundColor: theme.colors.surface }]}
      >
        <Icon name="minus" size={20} color="accent" />
      </PressableScale>
      <Text
        variant="label"
        style={styles.value}
        align="center"
        accessibilityLiveRegion="polite"
        accessibilityLabel={value === undefined ? `${label}: not logged` : `${label}: ${shown}`}
      >
        {shown}
      </Text>
      <PressableScale
        onPress={up}
        haptic="selection"
        disabled={value !== undefined && value >= max}
        accessibilityLabel={`More ${label.toLowerCase()}`}
        style={[styles.button, { backgroundColor: theme.colors.surface }]}
      >
        <Icon name="plus" size={20} color="accent" />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  label: { flex: 1 },
  row: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  value: { minWidth: 96 },
});
