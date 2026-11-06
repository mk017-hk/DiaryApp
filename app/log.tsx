import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Icon, IconChip, PressableScale, Stepper, Text } from '@/components';
import { space, useTheme, type Palette } from '@/design';
import {
  DISCHARGE,
  emptyLog,
  ENERGY,
  FLOWS,
  getDayLog,
  INTIMACY,
  PILL,
  saveDayLog,
  SYMPTOMS,
  useCycle,
  type DayLog,
  type DayLogChanges,
  type LogOption,
} from '@/features/cycle';
import { moodIcon } from '@/features/cycle/moodIcons';
import { addDays, daysBetween, fromDateKey, longDate, toDateKey } from '@/lib/date';
import { DEFAULT_EMOTIONS } from '@/services/supabase/emotions';

/**
 * The daily log.
 *
 * Everything about a day that is a tap rather than a sentence. Each tap is
 * saved as it is made — there is no Save button to forget — and the screen can
 * be closed at any point with nothing lost.
 *
 * Categories run in rows of round options, the way a cycle tracker lays them
 * out, because a row can be scanned in one glance and skipped in one swipe.
 * Every row is optional. Logging nothing at all is a complete answer.
 */
export default function Log() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { settings } = useCycle();
  const params = useLocalSearchParams<{ date?: string }>();

  const [today] = useState(() => toDateKey(new Date()));
  const [date, setDate] = useState(() =>
    typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : today,
  );
  const [log, setLog] = useState<DayLog>(() => emptyLog(date));

  useEffect(() => {
    let cancelled = false;
    void getDayLog(date).then((loaded) => {
      if (!cancelled) setLog(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const change = (changes: DayLogChanges) => {
    // Shown at once, saved behind it. The store serialises writes, so taps
    // made faster than storage can keep up still land in order.
    setLog((current) => ({ ...current, ...changes }) as DayLog);
    void saveDayLog(date, changes).then((saved) => {
      setLog((current) => (current.date === saved.date ? saved : current));
    });
  };

  const toggleIn = <T extends string>(list: T[], id: T): T[] =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  const isFuture = daysBetween(today, date) > 0;

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.canvas }]}>
      {/* ── Header: the day, and a way between days ────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <PressableScale
          onPress={() => setDate(addDays(date, -1))}
          accessibilityLabel="The day before"
        >
          <Icon name="chevron-left" size={28} color="ink" />
        </PressableScale>
        <View style={styles.headerTitle}>
          <Text variant="title3" align="center">
            {date === today ? 'Today' : longDate(fromDateKey(date))}
          </Text>
          {date === today && (
            <Text variant="caption" color="inkTertiary" align="center">
              {longDate(fromDateKey(date))}
            </Text>
          )}
        </View>
        <PressableScale
          onPress={() => setDate(addDays(date, 1))}
          disabled={date === today}
          accessibilityLabel="The day after"
        >
          <Icon name="chevron-right" size={28} color={date === today ? 'inkFaint' : 'ink'} />
        </PressableScale>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {isFuture ? (
          <Text variant="callout" color="inkSecondary">
            This day has not happened yet.
          </Text>
        ) : (
          <>
            {settings.enabled && (
              <Section title="Period" icon="water">
                <View style={styles.switchRow}>
                  <Text variant="bodyMedium" style={styles.flex}>
                    A period day
                  </Text>
                  <Switch
                    value={log.period}
                    onValueChange={(value) => change({ period: value })}
                    trackColor={{ true: theme.colors.period, false: theme.colors.border }}
                    accessibilityLabel="A period day"
                  />
                </View>
                <OptionRow
                  options={FLOWS}
                  selected={log.flow !== undefined ? [log.flow] : []}
                  tone="period"
                  single
                  onToggle={(id) => change({ flow: log.flow === id ? undefined : id })}
                />
              </Section>
            )}

            <Section title="Mood" icon="emoticon-outline">
              <OptionRow
                options={DEFAULT_EMOTIONS.map((emotion) => ({
                  id: emotion.slug,
                  label: emotion.label,
                  icon: moodIcon(emotion.slug),
                }))}
                selected={log.moods}
                onToggle={(slug) => change({ moods: toggleIn(log.moods, slug) })}
              />
            </Section>

            <Section title="Symptoms" icon="lightning-bolt-outline">
              <OptionRow
                options={SYMPTOMS}
                selected={log.symptoms}
                onToggle={(id) => change({ symptoms: toggleIn(log.symptoms, id) })}
              />
            </Section>

            <Section title="Energy" icon="battery-60">
              <OptionRow
                options={ENERGY}
                selected={log.energy !== undefined ? [log.energy] : []}
                single
                onToggle={(id) => change({ energy: log.energy === id ? undefined : id })}
              />
            </Section>

            <Section title="Sleep and water" icon="sleep">
              <Stepper
                label="Sleep"
                unit="hours"
                value={log.sleepHours}
                onChange={(value) => change({ sleepHours: value })}
                step={0.5}
                max={16}
                start={7}
              />
              <Stepper
                label="Water"
                unit={log.water === 1 ? 'glass' : 'glasses'}
                value={log.water}
                onChange={(value) => change({ water: value })}
                max={20}
                start={1}
              />
            </Section>

            {settings.enabled && (
              <Section title="Discharge" icon="water-opacity">
                <OptionRow
                  options={DISCHARGE}
                  selected={log.discharge !== undefined ? [log.discharge] : []}
                  single
                  onToggle={(id) => change({ discharge: log.discharge === id ? undefined : id })}
                />
              </Section>
            )}

            {settings.enabled && (
              <Section title="Sex and drive" icon="heart-outline">
                <OptionRow
                  options={INTIMACY}
                  selected={log.intimacy}
                  onToggle={(id) => change({ intimacy: toggleIn(log.intimacy, id) })}
                />
              </Section>
            )}

            {settings.enabled && settings.onPill && (
              <Section title="Pill" icon="pill">
                <OptionRow
                  options={PILL}
                  selected={log.pill !== undefined ? [log.pill] : []}
                  single
                  onToggle={(id) => change({ pill: log.pill === id ? undefined : id })}
                />
              </Section>
            )}

            <Card tone="accentWash" onPress={() => router.push('/compose?mode=write')}>
              <View style={styles.writeRow}>
                <Icon name="pencil-outline" color="accent" />
                <View style={styles.flex}>
                  <Text variant="bodyMedium">Write about it</Text>
                  <Text variant="caption" color="inkSecondary">
                    The log is the shape of a day. The diary is what it was like.
                  </Text>
                </View>
              </View>
            </Card>

            <Text variant="caption" color="inkTertiary" align="center">
              Saved as you tap. Only you can see this, even in a shared diary.
            </Text>
          </>
        )}

        <Button label="Done" onPress={() => router.back()} fullWidth />
      </ScrollView>
    </View>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <Card>
      <View style={styles.sectionTitle}>
        <Icon name={icon} size={18} color="accent" />
        <Text variant="title3" accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </Card>
  );
}

function OptionRow<Id extends string>({
  options,
  selected,
  onToggle,
  single = false,
  tone = 'accent',
}: {
  options: readonly LogOption<Id>[];
  selected: string[];
  onToggle: (id: Id) => void;
  single?: boolean;
  tone?: Extract<keyof Palette, 'accent' | 'period' | 'fertile'>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.options}
      style={styles.optionScroller}
      accessibilityRole={single ? 'radiogroup' : undefined}
    >
      {options.map((option) => (
        <IconChip
          key={option.id}
          label={option.label}
          icon={option.icon}
          selected={selected.includes(option.id)}
          onPress={() => onToggle(option.id)}
          tone={tone}
          single={single}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingHorizontal: space.lg, paddingTop: space.sm },
  fill: { flex: 1 },
  flex: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    paddingBottom: space.sm,
    paddingHorizontal: space.md,
  },
  headerTitle: { flex: 1 },
  optionScroller: { marginHorizontal: -space.md },
  options: { gap: space.xxs, paddingHorizontal: space.sm, paddingTop: space.xxs },
  sectionBody: { gap: space.sm, marginTop: space.sm },
  sectionTitle: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  switchRow: { alignItems: 'center', flexDirection: 'row' },
  writeRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
});
