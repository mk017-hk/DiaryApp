import { StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components';
import { useTheme } from '@/design';
import { fromDateKey, longDate } from '@/lib/date';

import type { DayMark } from '../cycleMath';

export interface DayCellProps {
  date: string;
  mark: DayMark | undefined;
  isToday: boolean;
  selected: boolean;
  /** Something was written that day. */
  hasEntry: boolean;
  /** Something was logged that day. */
  hasLog: boolean;
  /** Days after today are shown but quieter. */
  future: boolean;
  onPress: (date: string) => void;
  size?: number;
}

const MARK_WORDS: Record<DayMark, string> = {
  period: 'period',
  'predicted-period': 'period expected',
  fertile: 'fertile window',
  ovulation: 'estimated ovulation',
};

/**
 * One day, as the week strip and the month calendar both draw it.
 *
 * Each mark has its own shape as well as its own colour — a filled disc for a
 * logged period, a dashed ring for an expected one, a tinted disc for the
 * fertile window, a solid ring for ovulation — so the calendar still reads for
 * anyone who cannot tell clay from sage.
 */
export function DayCell({
  date,
  mark,
  isToday,
  selected,
  hasEntry,
  hasLog,
  future,
  onPress,
  size = 38,
}: DayCellProps) {
  const theme = useTheme();
  const c = theme.colors;

  const fill =
    mark === 'period'
      ? c.period
      : mark === 'fertile' || mark === 'ovulation'
        ? c.fertileWash
        : 'transparent';
  const border =
    mark === 'predicted-period'
      ? c.period
      : mark === 'ovulation'
        ? c.ovulation
        : selected
          ? c.ink
          : 'transparent';
  const textColor =
    mark === 'period'
      ? 'onAccent'
      : mark === 'fertile' || mark === 'ovulation'
        ? 'fertile'
        : future
          ? 'inkTertiary'
          : 'ink';

  const words = [
    longDate(fromDateKey(date)),
    isToday ? 'today' : null,
    mark !== undefined ? MARK_WORDS[mark] : null,
    hasEntry ? 'has an entry' : null,
    hasLog ? 'has a log' : null,
  ].filter((word): word is string => word !== null);

  return (
    <PressableScale
      onPress={() => onPress(date)}
      haptic="selection"
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={words.join(', ')}
      style={styles.cell}
    >
      <View
        style={[
          styles.disc,
          {
            backgroundColor: fill,
            borderColor: border,
            borderStyle: mark === 'predicted-period' ? 'dashed' : 'solid',
            borderWidth: mark === 'predicted-period' || mark === 'ovulation' || selected ? 2 : 0,
            borderRadius: size / 2,
            height: size,
            width: size,
          },
        ]}
      >
        <Text
          variant={isToday ? 'label' : 'callout'}
          color={textColor}
          style={isToday ? styles.today : undefined}
        >
          {String(fromDateKey(date).getDate())}
        </Text>
      </View>
      <View style={styles.dots}>
        {hasEntry && <View style={[styles.dot, { backgroundColor: c.accent }]} />}
        {hasLog && !hasEntry && <View style={[styles.dot, { backgroundColor: c.inkFaint }]} />}
        {isToday && !hasEntry && !hasLog && (
          <View style={[styles.dot, { backgroundColor: c.ink }]} />
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  cell: { alignItems: 'center', flex: 1, gap: 3, paddingVertical: 2 },
  disc: { alignItems: 'center', justifyContent: 'center' },
  dot: { borderRadius: 2.5, height: 5, width: 5 },
  dots: { flexDirection: 'row', gap: 3, height: 5 },
  today: { textDecorationLine: 'underline' },
});
