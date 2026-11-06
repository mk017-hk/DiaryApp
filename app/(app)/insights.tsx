import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, type DimensionValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Icon, ListRow, SectionHeader, Text } from '@/components';
import { space, useTheme } from '@/design';
import {
  averages,
  byPhase,
  labelFor,
  PHASE_LABELS,
  SYMPTOMS,
  topSymptoms,
  useCycle,
  type Cycle,
} from '@/features/cycle';
import { listEntries, useEntryChanges, type Entry } from '@/features/entries';
import { ARTICLES } from '@/features/library';
import { shortDate } from '@/lib/date';
import { DEFAULT_EMOTIONS } from '@/services/supabase/emotions';

/**
 * Insights.
 *
 * The long view: her cycles, what she logs, how the diary has felt. Every
 * figure here is a description of what she recorded. There are no scores, no
 * "normal" ranges drawn as targets, and nothing that tells her what a pattern
 * means — the same rule the rest of the app is built on.
 */
export default function Insights() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const cycle = useCycle();
  const tracking = cycle.settings.enabled;

  const [entries, setEntries] = useState<Entry[]>([]);
  const load = useCallback(async () => setEntries(await listEntries()), []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEntryChanges(() => void load());

  const logs = useMemo(() => [...cycle.logs.values()], [cycle.logs]);
  const phases = useMemo(
    () => (tracking ? byPhase(logs, entries, cycle.periods, cycle.summary) : []),
    [tracking, logs, entries, cycle.periods, cycle.summary],
  );
  const symptoms = useMemo(() => topSymptoms(logs), [logs]);
  const means = useMemo(() => averages(logs), [logs]);

  const longest = Math.max(
    ...cycle.summary.cycles.slice(0, 6).map((c) => c.length),
    cycle.summary.averageCycle,
  );

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.canvas }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="title1">Insights</Text>

        {tracking ? (
          <>
            {/* ── Cycle figures ─────────────────────────────── */}
            <View style={styles.figures}>
              <Figure
                value={String(cycle.summary.averageCycle)}
                unit="days"
                label="Cycle length"
                note={cycle.summary.learned ? 'Your average' : 'What you told me'}
              />
              <Figure
                value={String(cycle.summary.averagePeriod)}
                unit="days"
                label="Period length"
                note={cycle.periods.length > 1 ? 'Your average' : 'What you told me'}
              />
            </View>

            {cycle.summary.range !== null && (
              <Text variant="callout" color="inkSecondary">
                Your recent cycles have been between {cycle.summary.range.shortest} and{' '}
                {cycle.summary.range.longest} days long.
              </Text>
            )}

            {/* ── History ──────────────────────────────────── */}
            <View>
              <SectionHeader title="Cycle history" />
              <Card>
                {cycle.summary.cycles.length === 0 ? (
                  <Text variant="callout" color="inkSecondary">
                    Your history starts once you have logged two periods. Mark the first day of each
                    one on the calendar.
                  </Text>
                ) : (
                  cycle.summary.cycles
                    .slice(0, 6)
                    .map((c) => <CycleBar key={c.start} cycle={c} longest={longest} />)
                )}
              </Card>
            </View>

            {/* ── Across the cycle ─────────────────────────── */}
            <View>
              <SectionHeader title="Across your cycle" />
              {phases.length === 0 ? (
                <Card tone="surface">
                  <Text variant="callout" color="inkSecondary">
                    Log how you feel for a few weeks and this will show what tends to come up in
                    each part of your cycle — in your own words, not a textbook’s.
                  </Text>
                </Card>
              ) : (
                <View style={styles.stack}>
                  {phases.map((phase) => (
                    <Card
                      key={phase.phase}
                      tone={
                        phase.phase === 'period'
                          ? 'periodWash'
                          : phase.phase === 'fertile' || phase.phase === 'ovulation'
                            ? 'fertileWash'
                            : 'accentWash'
                      }
                    >
                      <Text variant="bodyMedium">{PHASE_LABELS[phase.phase]}</Text>
                      <Text variant="caption" color="inkTertiary">
                        From {phase.days} days you logged or wrote on
                      </Text>
                      {phase.moods.length > 0 && (
                        <Text variant="callout" style={styles.phaseLine}>
                          Felt: {phase.moods.map((m) => emotionLabel(m.id)).join(', ')}
                        </Text>
                      )}
                      {phase.symptoms.length > 0 && (
                        <Text variant="callout">
                          Logged: {phase.symptoms.map((s) => labelFor(SYMPTOMS, s.id)).join(', ')}
                        </Text>
                      )}
                    </Card>
                  ))}
                </View>
              )}
            </View>
          </>
        ) : (
          <Card
            tone="periodWash"
            onPress={() => router.push('/cycle-settings')}
            accessibilityLabel="Turn on cycle tracking"
          >
            <View style={styles.offerRow}>
              <Icon name="sync" color="period" />
              <View style={styles.flex}>
                <Text variant="bodyMedium">Track your cycle too</Text>
                <Text variant="caption" color="inkSecondary">
                  Predictions, a cycle history, and how your moods line up with your cycle.
                </Text>
              </View>
              <Icon name="chevron-right" color="inkFaint" />
            </View>
          </Card>
        )}

        {/* ── What she logs ─────────────────────────────────── */}
        {(symptoms.length > 0 || means.sleep !== null || means.water !== null) && (
          <View>
            <SectionHeader title="What you log" />
            <Card>
              {symptoms.length > 0 && (
                <View style={styles.tallies}>
                  {symptoms.map((symptom) => (
                    <View
                      key={symptom.id}
                      style={[styles.tally, { backgroundColor: theme.colors.surface }]}
                    >
                      <Text variant="label">{labelFor(SYMPTOMS, symptom.id)}</Text>
                      <Text variant="caption" color="inkTertiary">
                        {symptom.count === 1 ? 'once' : `${String(symptom.count)} days`}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {means.sleep !== null && (
                <ListRow
                  icon="sleep"
                  title={`${String(means.sleep)} hours`}
                  subtitle="Sleep, on the nights you logged it"
                />
              )}
              {means.water !== null && (
                <ListRow
                  icon="cup-water"
                  title={`${String(means.water)} glasses`}
                  subtitle="Water, on the days you logged it"
                />
              )}
            </Card>
          </View>
        )}

        {/* ── The diary ─────────────────────────────────────── */}
        <View>
          <SectionHeader title="Your diary" />
          <Card>
            <ListRow
              icon="chart-bell-curve-cumulative"
              title="Patterns"
              subtitle="Moods and words over a month, three months, a year"
              onPress={() => router.push('/patterns')}
            />
            <ListRow
              icon="sprout-outline"
              title="Growth"
              subtitle="The people, places and themes you come back to"
              onPress={() => router.push('/growth')}
            />
            <ListRow
              icon="book-multiple-outline"
              title="Threads"
              subtitle="Every story you have kept, open and closed"
              onPress={() => router.push('/threads')}
            />
            <ListRow
              icon="bookmark-outline"
              title="Saved"
              subtitle="Entries you marked to keep close"
              onPress={() => router.push('/saved')}
            />
            <ListRow
              icon="magnify"
              title="Search"
              subtitle="Everything you have written"
              onPress={() => router.push('/search')}
            />
          </Card>
        </View>

        {/* ── Library ───────────────────────────────────────── */}
        <View>
          <SectionHeader title="Read" />
          <View style={styles.stack}>
            {ARTICLES.map((article) => (
              <Card
                key={article.id}
                onPress={() => router.push(`/library/${article.id}`)}
                accessibilityLabel={article.title}
              >
                <View style={styles.offerRow}>
                  <View style={[styles.articleIcon, { backgroundColor: theme.colors.accentWash }]}>
                    <Icon name={article.icon} size={20} color="accent" />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="bodyMedium">{article.title}</Text>
                    <Text variant="caption" color="inkTertiary" numberOfLines={2}>
                      {article.summary}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function emotionLabel(slug: string): string {
  return DEFAULT_EMOTIONS.find((emotion) => emotion.slug === slug)?.label ?? slug;
}

function Figure({
  value,
  unit,
  label,
  note,
}: {
  value: string;
  unit: string;
  label: string;
  note: string;
}) {
  return (
    <Card style={styles.figure}>
      <Text variant="caption" color="inkTertiary">
        {label}
      </Text>
      <View style={styles.figureValue}>
        <Text variant="display">{value}</Text>
        <Text variant="callout" color="inkSecondary">
          {unit}
        </Text>
      </View>
      <Text variant="caption" color="inkTertiary">
        {note}
      </Text>
    </Card>
  );
}

/** One past cycle: the period in clay, the rest in a quieter tone, to scale. */
function CycleBar({ cycle, longest }: { cycle: Cycle; longest: number }) {
  const theme = useTheme();
  const width: DimensionValue = `${Math.max(12, (cycle.length / longest) * 100)}%`;
  const periodShare: DimensionValue = `${Math.min(100, (cycle.periodLength / cycle.length) * 100)}%`;

  return (
    <View
      style={styles.bar}
      accessible
      accessibilityLabel={`Cycle starting ${shortDate(cycle.start)}: ${String(cycle.length)} days, period ${String(cycle.periodLength)} days`}
    >
      <View style={styles.barLabels}>
        <Text variant="caption" color="inkSecondary">
          {shortDate(cycle.start)}
        </Text>
        <Text variant="caption" color="inkSecondary">
          {cycle.length} days
        </Text>
      </View>
      <View style={[styles.barTrack, { width, backgroundColor: theme.colors.surfaceMuted }]}>
        <View
          style={[styles.barPeriod, { width: periodShare, backgroundColor: theme.colors.period }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  articleIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  bar: { gap: 4, paddingVertical: space.xxs },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  barPeriod: { borderRadius: 6, height: '100%' },
  barTrack: { borderRadius: 6, height: 12, overflow: 'hidden' },
  content: { gap: space.lg, paddingBottom: space.xxl, paddingHorizontal: space.lg },
  figure: { flex: 1, gap: 2 },
  figureValue: { alignItems: 'baseline', flexDirection: 'row', gap: space.xxs },
  figures: { flexDirection: 'row', gap: space.sm },
  fill: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  offerRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  phaseLine: { marginTop: space.xs },
  stack: { gap: space.sm },
  tallies: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.xs },
  tally: { borderRadius: 14, paddingHorizontal: space.sm, paddingVertical: space.xs },
});
