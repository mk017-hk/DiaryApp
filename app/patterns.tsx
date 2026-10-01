import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, DiaryPage, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import {
  listEntries,
  listThreads,
  useEntryChanges,
  type Entry,
  type Thread,
} from '@/features/entries';
import { MOOD_LABELS, WINDOWS, summarise, texture } from '@/features/patterns';
import { fromDateKey, fullDate, longDate } from '@/lib/date';
import { DEFAULT_EMOTIONS } from '@/services/supabase/emotions';

/**
 * Patterns.
 *
 * What a stretch of diary looks like from further back than a day. Mood as a
 * shape rather than a number, the words that kept coming up, and the days
 * themselves as texture.
 *
 * What this screen refuses to be is the thing it would most easily become. No
 * average, no score for a month, no streak, no count of entries, no mention of
 * a gap. Every one of those is a line of obvious code away, and every one turns
 * a diary into something you can be behind on. Somebody who stopped writing for
 * three weeks in February had a reason, and the app is not owed it.
 *
 * So the screen shows and does not conclude. Naming what the shape means is
 * hers to do, and the one thing the assistant is forbidden from doing.
 */

const LABEL_BY_SLUG = new Map(DEFAULT_EMOTIONS.map((emotion) => [emotion.slug, emotion.label]));

/** Tall enough for five levels to be distinguishable without becoming a graph. */
const CHART_HEIGHT = 140;

export default function Patterns() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [days, setDays] = useState<number>(90);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);

  // Settled once, not read during render: a screen left open past midnight
  // must not silently slide its window underneath somebody.
  const [today] = useState(() => new Date());

  const load = useCallback(async () => {
    const [all, stories] = await Promise.all([listEntries(), listThreads()]);
    setEntries(all);
    setThreads(stories);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEntryChanges(() => void load());

  const patterns = useMemo(
    () => summarise(entries, { today, days, ...(threadId === undefined ? {} : { threadId }) }),
    [entries, today, days, threadId],
  );

  const strip = useMemo(
    () => texture(patterns.daysWritten, { today, days }),
    [patterns.daysWritten, today, days],
  );

  const mostUsed = patterns.emotions[0]?.count ?? 1;

  return (
    <DiaryPage ruled={false}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text variant="title1">Patterns</Text>
          <PressableScale
            onPress={() => router.back()}
            haptic="light"
            accessibilityLabel="Close"
            style={styles.close}
          >
            <Text variant="callout" color="inkTertiary">
              Close
            </Text>
          </PressableScale>
        </View>

        <View style={styles.chips}>
          {WINDOWS.map((option) => (
            <Chip
              key={option.days}
              label={option.label}
              selected={days === option.days}
              onPress={() => setDays(option.days)}
            />
          ))}
        </View>

        {threads.length > 0 && (
          <View style={styles.chips}>
            <Chip
              label="Everything"
              selected={threadId === undefined}
              onPress={() => setThreadId(undefined)}
            />
            {threads.map((thread) => (
              <Chip
                key={thread.id}
                label={thread.title}
                selected={threadId === thread.id}
                onPress={() => setThreadId(thread.id)}
              />
            ))}
          </View>
        )}

        {patterns.span === null ? (
          // Nothing drawn at all rather than an empty chart with an axis and a
          // date range, which would look like a report card for a month
          // somebody did not write in.
          <Text variant="callout" color="inkTertiary" style={styles.blank}>
            Nothing here yet for this stretch of time. It fills in as you write.
          </Text>
        ) : (
          <>
            <Section title="How it has felt">
              {patterns.moods.length === 0 ? (
                <Text variant="callout" color="inkTertiary">
                  No days in this stretch had a feeling attached. That question is always optional.
                </Text>
              ) : (
                <MoodChart
                  points={patterns.moods}
                  onOpen={(entryId) => router.push(`/entry/${entryId}`)}
                />
              )}
            </Section>

            {patterns.emotions.length > 0 && (
              <Section title="What kept coming up">
                <View style={styles.words}>
                  {patterns.emotions.slice(0, 8).map((item) => (
                    <View
                      key={item.slug}
                      style={[
                        styles.word,
                        {
                          backgroundColor: theme.colors.accentWash,
                          borderRadius: theme.radius.full,
                          // Weight by how often, so the shape of a season is
                          // legible without printing a number beside a feeling.
                          opacity: 0.45 + 0.55 * (item.count / mostUsed),
                        },
                      ]}
                    >
                      <Text variant="label" color="ink">
                        {LABEL_BY_SLUG.get(item.slug) ?? item.slug}
                      </Text>
                    </View>
                  ))}
                </View>
              </Section>
            )}

            <Section title="The days themselves">
              <View style={styles.strip}>
                {strip.map((day) => (
                  <View
                    key={day.date}
                    style={[
                      styles.tick,
                      {
                        backgroundColor: day.written
                          ? theme.colors.accentSoft
                          : theme.colors.border,
                      },
                    ]}
                  />
                ))}
              </View>
              {/* Deliberately not "you wrote on 14 days". The marks say what
                  there is to say, and counting them is how a diary becomes
                  something to keep up with. */}
              {/* The year is included when the span crosses one. Without it,
                  a year's worth reads as "15 October to 15 September", which
                  looks like a mistake rather than eleven months. */}
              <Text variant="caption" color="inkTertiary">
                {spanLabel(patterns.span)}
              </Text>
            </Section>
          </>
        )}
      </ScrollView>
    </DiaryPage>
  );
}

/** "8 July to 30 September", or with years when the span crosses one. */
function spanLabel(span: { from: string; to: string }): string {
  const from = fromDateKey(span.from);
  const to = fromDateKey(span.to);

  return from.getFullYear() === to.getFullYear()
    ? `${longDate(from)} to ${longDate(to)}`
    : `${fullDate(from)} to ${fullDate(to)}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" color="inkTertiary">
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * Mood over time, as a shape.
 *
 * One mark per entry, placed by how the day felt, with the five words down the
 * side so the picture explains itself without a legend or a number. No line
 * joining them: a line implies the days between were measured, and they were
 * not.
 */
function MoodChart({
  points,
  onOpen,
}: {
  points: { entryId: string; date: string; mood: number }[];
  onOpen: (entryId: string) => void;
}) {
  const theme = useTheme();

  // Guarded: a single point would otherwise divide by zero and land nowhere.
  const first = points[0]?.date ?? '';
  const last = points[points.length - 1]?.date ?? '';
  const spread = Math.max(1, fromDateKey(last).getTime() - fromDateKey(first).getTime());

  return (
    <View style={styles.chartRow}>
      <View style={styles.axis}>
        {[5, 4, 3, 2, 1].map((level) => (
          <Text key={level} variant="caption" color="inkFaint">
            {MOOD_LABELS[level]}
          </Text>
        ))}
      </View>

      <View style={[styles.chart, { borderColor: theme.colors.border }]}>
        {points.map((point) => {
          const across =
            points.length === 1
              ? 50
              : ((fromDateKey(point.date).getTime() - fromDateKey(first).getTime()) / spread) * 100;

          return (
            <PressableScale
              key={point.entryId}
              onPress={() => onOpen(point.entryId)}
              haptic="light"
              ensureTouchTarget={false}
              accessibilityLabel={`${MOOD_LABELS[point.mood] ?? ''} on ${longDate(
                fromDateKey(point.date),
              )}`}
              style={[
                styles.point,
                {
                  backgroundColor: theme.colors.accent,
                  // 5 at the top, 1 at the bottom, inset so a mark at either
                  // extreme is not half outside the frame.
                  top: `${((5 - point.mood) / 4) * 84 + 4}%`,
                  left: `${across * 0.94 + 1}%`,
                },
              ]}
            >
              <View />
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { height: CHART_HEIGHT, justifyContent: 'space-between', width: 54 },
  blank: { marginTop: space.xl, maxWidth: 320 },
  chart: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    flex: 1,
    height: CHART_HEIGHT,
    position: 'relative',
  },
  chartRow: { flexDirection: 'row', gap: space.xs, marginTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.md },
  close: { padding: space.xxs },
  content: { paddingHorizontal: space.lg },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  point: { borderRadius: 5, height: 10, position: 'absolute', width: 10 },
  section: { gap: space.sm, marginTop: space.xxl },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  tick: { borderRadius: 1, height: 10, width: 4 },
  word: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
