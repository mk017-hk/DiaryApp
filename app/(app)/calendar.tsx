import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiaryPage, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import { datesWithEntries, entriesForDate, useEntryChanges, type Entry } from '@/features/entries';
import { fromDateKey, longDate, monthGrid, monthName, toDateKey } from '@/lib/date';

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * The calendar.
 *
 * How you get back to a particular day. Days you wrote on are marked with a
 * small filled dot rather than shading the whole cell — a month where you
 * missed most days should look calm, not like a chart of failures.
 */
export default function Calendar() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Read once, lazily, rather than on every render. A clock read during render
  // is impure — React 19 says so — and here it would also mean the month grid
  // could silently change month underneath someone at midnight.
  const [todayKey] = useState(() => toDateKey(new Date()));
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string>(todayKey);
  const [dayEntries, setDayEntries] = useState<Entry[]>([]);

  const load = useCallback(async () => {
    const [dates, found] = await Promise.all([datesWithEntries(), entriesForDate(selected)]);
    setMarked(dates);
    setDayEntries(found);
  }, [selected]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // A sync landing has to move the dots too, not just the day below them.
  useEntryChanges(() => void load());

  const cells = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const shiftMonth = (delta: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));

  return (
    <DiaryPage ruled={false}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.monthHeader}>
          <PressableScale
            onPress={() => shiftMonth(-1)}
            haptic="light"
            accessibilityLabel="Previous month"
            style={styles.arrow}
          >
            <Text variant="title3" color="inkTertiary">
              ‹
            </Text>
          </PressableScale>

          <Text variant="title2">
            {monthName(cursor.getMonth())} {cursor.getFullYear()}
          </Text>

          <PressableScale
            onPress={() => shiftMonth(1)}
            haptic="light"
            accessibilityLabel="Next month"
            style={styles.arrow}
          >
            <Text variant="title3" color="inkTertiary">
              ›
            </Text>
          </PressableScale>
        </View>

        <View style={styles.weekdays}>
          {WEEKDAY_INITIALS.map((initial, index) => (
            <View key={index} style={styles.cell}>
              <Text variant="caption" color="inkFaint" align="center">
                {initial}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((dateKey, index) => {
            if (dateKey === null)
              return <View key={`blank-${String(index)}`} style={styles.cell} />;

            const date = fromDateKey(dateKey);
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selected;
            const hasEntry = marked.has(dateKey);

            return (
              <PressableScale
                key={dateKey}
                onPress={() => setSelected(dateKey)}
                haptic="selection"
                ensureTouchTarget={false}
                accessibilityLabel={longDate(date)}
                accessibilityState={{ selected: isSelected }}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    isSelected && {
                      backgroundColor: theme.colors.accent,
                      borderRadius: theme.radius.full,
                    },
                  ]}
                >
                  <Text
                    variant={isToday ? 'bodyMedium' : 'body'}
                    color={isSelected ? 'onAccent' : isToday ? 'accent' : 'ink'}
                    align="center"
                  >
                    {date.getDate()}
                  </Text>
                </View>
                <View
                  style={[
                    styles.dot,
                    {
                      // On a selected day the cell behind is the accent, so the
                      // dot has to lift off it rather than blend in.
                      backgroundColor: !hasEntry
                        ? 'transparent'
                        : isSelected
                          ? theme.colors.onAccent
                          : theme.colors.accentSoft,
                    },
                  ]}
                />
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.selectedDay}>
          <Text variant="overline" color="inkTertiary">
            {longDate(fromDateKey(selected))}
          </Text>

          {dayEntries.length === 0 ? (
            <Text variant="callout" color="inkTertiary">
              Nothing written on this day.
            </Text>
          ) : (
            dayEntries.map((entry) => (
              <PressableScale
                key={entry.id}
                onPress={() => router.push(`/entry/${entry.id}`)}
                haptic="light"
                accessibilityLabel="Open entry"
                style={styles.entryRow}
              >
                <Text variant="body" numberOfLines={3}>
                  {entry.body.length > 0 ? entry.body : 'A recorded moment'}
                </Text>
              </PressableScale>
            ))
          )}
        </View>
      </ScrollView>
    </DiaryPage>
  );
}

const styles = StyleSheet.create({
  arrow: { paddingHorizontal: space.md, paddingVertical: space.xs },
  cell: { alignItems: 'center', paddingVertical: space.xxs, width: `${100 / 7}%` },
  content: { paddingHorizontal: space.lg },
  day: { alignItems: 'center', height: 38, justifyContent: 'center', width: 38 },
  dot: { borderRadius: 2, height: 4, marginTop: 2, width: 4 },
  entryRow: { paddingVertical: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  selectedDay: { gap: space.xs, marginTop: space.xl },
  weekdays: { flexDirection: 'row', marginTop: space.lg },
});
