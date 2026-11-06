import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import { setPeriodDays, useCycle } from '@/features/cycle';
import { addDays, daysBetween, fromDateKey, monthGrid, monthName } from '@/lib/date';

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS_BACK = 6;

/**
 * Marking a period.
 *
 * Tap the first day and the usual length is filled in after it; tap any marked
 * day to unmark just that one. Nothing is saved until Save, so a mis-tap on the
 * wrong month costs nothing.
 *
 * The auto-fill is the whole reason this is one tap rather than five, and it
 * only fills forward from a day with nothing marked near it — tapping inside or
 * beside an existing period adds or removes a single day, which is what someone
 * correcting a period they already logged expects.
 */
export default function EditPeriod() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { today, periodDays, summary } = useCycle();

  // Null until the first tap: until then the screen shows what is stored, so
  // opening it before the cycle has finished loading does not start from an
  // empty calendar and then save that emptiness over her history.
  const [edits, setEdits] = useState<Set<string> | null>(null);
  const marked = edits ?? periodDays;
  const [saving, setSaving] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const scrolled = useRef(false);

  const months = useMemo(() => {
    const now = fromDateKey(today);
    return Array.from({ length: MONTHS_BACK + 1 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK + index, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }, [today]);

  const near = (date: string, set: Set<string>) =>
    [-2, -1, 1, 2].some((offset) => set.has(addDays(date, offset)));

  const toggle = (date: string) => {
    if (daysBetween(today, date) > 0) return;
    setEdits((pending) => {
      const current = pending ?? periodDays;
      const next = new Set(current);
      if (next.has(date)) {
        next.delete(date);
        return next;
      }
      if (near(date, current)) {
        next.add(date);
        return next;
      }
      for (let offset = 0; offset < summary.averagePeriod; offset += 1) {
        const day = addDays(date, offset);
        if (daysBetween(today, day) > 0) break;
        next.add(day);
      }
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    const on = [...marked].filter((date) => !periodDays.has(date));
    const off = [...periodDays].filter((date) => !marked.has(date));
    await setPeriodDays({ on, off });
    setSaving(false);
    router.back();
  };

  const changed =
    edits !== null &&
    (edits.size !== periodDays.size || [...edits].some((date) => !periodDays.has(date)));

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.canvas }]}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <PressableScale onPress={() => router.back()} accessibilityLabel="Close without saving">
          <Icon name="close" size={26} color="ink" />
        </PressableScale>
        <Text variant="title3">Period dates</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text variant="caption" color="inkSecondary" align="center" style={styles.hint}>
        Tap the first day of a period. The usual {String(summary.averagePeriod)} days are filled in;
        tap any day to change it.
      </Text>

      <ScrollView
        contentContainerStyle={styles.months}
        showsVerticalScrollIndicator={false}
        // Today's month at the bottom, where the thumb already is — once, on
        // first layout, so a tap further up the list does not jump away.
        ref={scroller}
        onContentSizeChange={() => {
          if (scrolled.current) return;
          scrolled.current = true;
          scroller.current?.scrollToEnd({ animated: false });
        }}
      >
        {months.map(({ year, month }) => (
          <View key={`${String(year)}-${String(month)}`} style={styles.month}>
            <Text variant="bodyMedium">
              {monthName(month)} {year}
            </Text>
            <View style={styles.grid}>
              {WEEKDAY_INITIALS.map((initial, index) => (
                <View key={`w-${String(index)}`} style={styles.cell}>
                  <Text variant="caption" color="inkTertiary">
                    {initial}
                  </Text>
                </View>
              ))}
              {monthGrid(year, month).map((date, index) => {
                if (date === null) return <View key={`b-${String(index)}`} style={styles.cell} />;
                const on = marked.has(date);
                const future = daysBetween(today, date) > 0;
                return (
                  <View key={date} style={styles.cell}>
                    <PressableScale
                      onPress={() => toggle(date)}
                      haptic="selection"
                      disabled={future}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on, disabled: future }}
                      accessibilityLabel={`${String(fromDateKey(date).getDate())} ${monthName(month)}${on ? ', period' : ''}`}
                      style={styles.dayTap}
                    >
                      <Text
                        variant="caption"
                        color={future ? 'inkFaint' : date === today ? 'accent' : 'inkSecondary'}
                      >
                        {String(fromDateKey(date).getDate())}
                      </Text>
                      <View
                        style={[
                          styles.check,
                          {
                            backgroundColor: on ? theme.colors.period : 'transparent',
                            borderColor: on ? theme.colors.period : theme.colors.borderStrong,
                          },
                        ]}
                      >
                        {on && <Icon name="check" size={14} color="onAccent" />}
                      </View>
                    </PressableScale>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + space.sm, borderTopColor: theme.colors.border },
        ]}
      >
        <Button
          label="Save"
          onPress={() => void save()}
          loading={saving}
          disabled={!changed}
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { alignItems: 'center', paddingVertical: 2, width: `${100 / 7}%` },
  check: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1.5,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  dayTap: { alignItems: 'center', gap: 2 },
  fill: { flex: 1 },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  headerSpacer: { width: 26 },
  hint: { paddingHorizontal: space.xl, paddingVertical: space.sm },
  month: { gap: space.xs },
  months: { gap: space.lg, paddingBottom: space.lg, paddingHorizontal: space.md },
});
