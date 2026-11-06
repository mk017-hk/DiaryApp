import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Icon, PressableScale, Text } from '@/components';
import { space, useTheme, type Palette } from '@/design';
import {
  calendarMarks,
  cycleOn,
  DayCell,
  ENERGY,
  FLOWS,
  labelFor,
  PHASE_LABELS,
  SYMPTOMS,
  useCycle,
  type DayLog,
  type DayMark,
} from '@/features/cycle';
import { datesWithEntries, entriesForDate, useEntryChanges, type Entry } from '@/features/entries';
import { EntryCard } from '@/features/entries/EntryCard';
import { daysBetween, fromDateKey, longDate, monthGrid, monthName, toDateKey } from '@/lib/date';
import { DEFAULT_EMOTIONS } from '@/services/supabase/emotions';

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * The calendar.
 *
 * A month, with everything on it: logged periods as filled discs, the next one
 * as a dashed ring, the fertile window shaded, and a dot under any day with an
 * entry or a log. Tap a day and everything about it is underneath — what was
 * logged, what was written, and the way to add either.
 *
 * A month where most days are empty should still look calm. Nothing here
 * marks a missed day.
 */
export default function Calendar() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cycle = useCycle();
  const tracking = cycle.settings.enabled;

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string>(() => toDateKey(new Date()));
  const [entryDays, setEntryDays] = useState<Set<string>>(new Set());
  const [dayEntries, setDayEntries] = useState<Entry[]>([]);

  const load = useCallback(async () => {
    const [dates, found] = await Promise.all([datesWithEntries(), entriesForDate(selected)]);
    setEntryDays(dates);
    setDayEntries(found);
  }, [selected]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEntryChanges(() => void load());

  const cells = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const first = toDateKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const last = toDateKey(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));

  const marks = tracking
    ? calendarMarks(first, last, cycle.today, cycle.periodDays, cycle.periods, cycle.summary)
    : new Map<string, DayMark>();

  const shiftMonth = (delta: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));

  const log = cycle.logs.get(selected);
  const future = daysBetween(cycle.today, selected) > 0;
  const then = tracking ? cycleOn(selected, cycle.periods, cycle.summary) : null;
  const selectedMark = marks.get(selected);

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.canvas }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text variant="title1">Calendar</Text>
          {tracking && (
            <PressableScale
              onPress={() => router.push('/period')}
              accessibilityLabel="Edit period dates"
              style={[styles.editPill, { backgroundColor: theme.colors.periodWash }]}
            >
              <Icon name="water" size={16} color="period" />
              <Text variant="label" color="period">
                Edit period
              </Text>
            </PressableScale>
          )}
        </View>

        <Card style={styles.monthCard}>
          <View style={styles.monthHeader}>
            <PressableScale onPress={() => shiftMonth(-1)} accessibilityLabel="Previous month">
              <Icon name="chevron-left" size={28} color="inkSecondary" />
            </PressableScale>
            <Text variant="title3">
              {monthName(cursor.getMonth())} {cursor.getFullYear()}
            </Text>
            <PressableScale onPress={() => shiftMonth(1)} accessibilityLabel="Next month">
              <Icon name="chevron-right" size={28} color="inkSecondary" />
            </PressableScale>
          </View>

          <View style={styles.row}>
            {WEEKDAY_INITIALS.map((initial, index) => (
              <View key={index} style={styles.cell}>
                <Text variant="caption" color="inkTertiary" align="center">
                  {initial}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((date, index) =>
              date === null ? (
                <View key={`blank-${String(index)}`} style={styles.cell} />
              ) : (
                <View key={date} style={styles.cell}>
                  <DayCell
                    date={date}
                    mark={marks.get(date)}
                    isToday={date === cycle.today}
                    selected={date === selected}
                    hasEntry={entryDays.has(date)}
                    hasLog={cycle.logs.has(date)}
                    future={daysBetween(cycle.today, date) > 0}
                    onPress={setSelected}
                    size={36}
                  />
                </View>
              ),
            )}
          </View>

          {tracking && (
            <View style={styles.legend}>
              <Legend color="period" label="Period" />
              <Legend color="period" label="Expected" dashed />
              <Legend color="fertileWash" label="Fertile" />
              <Legend color="ovulation" label="Ovulation" ring />
            </View>
          )}
        </Card>

        {/* ── The selected day ─────────────────────────────────── */}
        <View style={styles.day}>
          <Text variant="title3">{longDate(fromDateKey(selected))}</Text>

          {tracking &&
            then !== null &&
            (then.dayOfCycle !== null || selectedMark !== undefined) && (
              <Text variant="callout" color="inkSecondary">
                {[
                  then.dayOfCycle !== null && !future
                    ? `Cycle day ${String(then.dayOfCycle)}`
                    : null,
                  selectedMark === 'predicted-period'
                    ? 'Period expected'
                    : selectedMark === 'period'
                      ? 'Period'
                      : selectedMark === 'ovulation'
                        ? 'Estimated ovulation'
                        : selectedMark === 'fertile'
                          ? 'Fertile window'
                          : then.phase !== null && !future
                            ? PHASE_LABELS[then.phase]
                            : null,
                ]
                  .filter((part): part is string => part !== null)
                  .join(' · ')}
              </Text>
            )}

          {log !== undefined && (
            <Card tone="surface">
              <Text variant="overline" color="inkTertiary">
                Logged
              </Text>
              <Text variant="callout" style={styles.logged}>
                {describeLog(log)}
              </Text>
            </Card>
          )}

          {!future && (
            <View style={styles.actions}>
              <Button
                label={log === undefined ? 'Log this day' : 'Edit log'}
                variant="secondary"
                onPress={() => router.push(`/log?date=${selected}`)}
                style={styles.action}
              />
              <Button
                label="Write"
                variant="secondary"
                onPress={() => router.push(`/compose?mode=write&date=${selected}`)}
                style={styles.action}
              />
            </View>
          )}

          {dayEntries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onPress={() => router.push(`/entry/${entry.id}`)}
            />
          ))}

          {dayEntries.length === 0 && !future && (
            <Text variant="caption" color="inkTertiary">
              Nothing written on this day.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function describeLog(log: DayLog): string {
  const parts: string[] = [];
  if (log.flow !== undefined) parts.push(`${labelFor(FLOWS, log.flow)} flow`);
  else if (log.period) parts.push('Period');
  for (const slug of log.moods)
    parts.push(DEFAULT_EMOTIONS.find((e) => e.slug === slug)?.label ?? slug);
  for (const id of log.symptoms) parts.push(labelFor(SYMPTOMS, id));
  if (log.energy !== undefined) parts.push(`${labelFor(ENERGY, log.energy)} energy`);
  if (log.sleepHours !== undefined) parts.push(`${String(log.sleepHours)} hours’ sleep`);
  if (log.water !== undefined) parts.push(`${String(log.water)} glasses of water`);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing yet';
}

function Legend({
  color,
  label,
  dashed = false,
  ring = false,
}: {
  color: keyof Palette;
  label: string;
  dashed?: boolean;
  ring?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendSwatch,
          dashed || ring
            ? {
                borderColor: theme.colors[color],
                borderStyle: dashed ? 'dashed' : 'solid',
                borderWidth: 2,
              }
            : { backgroundColor: theme.colors[color] },
        ]}
      />
      <Text variant="caption" color="inkSecondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: 'row', gap: space.xs },
  cell: { alignItems: 'center', width: `${100 / 7}%` },
  content: { gap: space.lg, paddingBottom: space.xxl, paddingHorizontal: space.lg },
  day: { gap: space.sm },
  editPill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: space.xxs,
    minHeight: 36,
    paddingHorizontal: space.sm,
  },
  fill: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.xxs },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    justifyContent: 'center',
    marginTop: space.md,
  },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: space.xxs },
  legendSwatch: { borderRadius: 7, height: 14, width: 14 },
  logged: { marginTop: space.xxs },
  monthCard: { paddingHorizontal: space.xs },
  monthHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  row: { flexDirection: 'row', marginBottom: space.xxs },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});
