import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, DiaryPage, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import { AssistantQuestion, dailyPrompt, personalGreeting } from '@/features/assistant';
import {
  listEntries,
  onThisDay,
  openThreads,
  useEntryChanges,
  useSync,
  type Entry,
  type Thread,
} from '@/features/entries';
import { VideoPoster } from '@/features/media';
import { useProfile } from '@/features/profile';
import { fromDateKey, longDate, toDateKey, yearsAgo } from '@/lib/date';

/**
 * Today.
 *
 * The assistant asks, and the whole screen is arranged around answering. Not a
 * dashboard — one question, one way to answer it, and then what you have
 * already written, quietly below.
 */
export default function Today() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { name, tone, intentions, capture } = useProfile();
  const { state: syncState, pending } = useSync();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [memories, setMemories] = useState<Entry[]>([]);
  const [today, setToday] = useState<Date | null>(null);
  const [hasEntryToday, setHasEntryToday] = useState(false);
  const [question, setQuestion] = useState('');
  const [threads, setThreads] = useState<Thread[]>([]);

  // Everything time-dependent is settled here rather than during render.
  // Reading the clock while rendering makes the greeting and the question
  // liable to change on any incidental re-render, and React 19 rightly
  // treats it as impure.
  const load = useCallback(async () => {
    const [all, resurfaced, stories] = await Promise.all([
      listEntries(),
      onThisDay(),
      openThreads(),
    ]);

    const now = new Date();
    const todayKey = toDateKey(now);
    const answeredToday = all.some((entry) => entry.entryDate === todayKey);
    const latest = all[0];
    const daysSinceLast =
      latest === undefined
        ? null
        : Math.round(
            (now.getTime() - fromDateKey(latest.entryDate).getTime()) / (1000 * 60 * 60 * 24),
          );

    setEntries(all);
    setMemories(resurfaced);
    setThreads(stories);
    setToday(now);
    setHasEntryToday(answeredToday);
    setQuestion(
      dailyPrompt({ name, tone, intentions, daysSinceLast, hasEntryToday: answeredToday }),
    );
  }, [name, tone, intentions]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // And again when a sync lands, so an entry written on another phone appears
  // here rather than waiting for you to navigate away and back.
  useEntryChanges(() => void load());

  // Nothing renders until the clock has been read once — a flash of the wrong
  // greeting is worse than a beat of nothing.
  if (today === null) return <DiaryPage />;

  return (
    <DiaryPage>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text variant="caption" color="inkTertiary">
            {longDate(today)}
          </Text>
          <View style={styles.headerRight}>
            {/* Only when something is actually waiting. A permanent status
                light would turn a diary into an inbox, and being offline is
                the ordinary condition of a phone, not a problem to report. */}
            {syncState === 'offline' && pending > 0 && (
              <Text variant="caption" color="inkFaint">
                Saved here · {pending} to send
              </Text>
            )}

            {/* The only way out of the diary and into settings. Deliberately
                small: nothing on this screen should compete with the
                question. */}
            <PressableScale
              onPress={() => router.push('/account')}
              haptic="light"
              accessibilityLabel="Your account and settings"
            >
              <Text variant="caption" color="inkFaint">
                You
              </Text>
            </PressableScale>
          </View>
        </View>

        <Animated.View entering={FadeInDown.duration(400)} style={styles.opening}>
          {/* The 'barely at all' tone returns nothing, and an empty line of
              type would leave a gap where a greeting used to be. */}
          {personalGreeting(name, tone, today).length > 0 && (
            <Text variant="title3" color="inkSecondary">
              {personalGreeting(name, tone, today)}
            </Text>
          )}
          {/* The assistant's own question when there is one, and the
              templated pool when there is not — which is most days, and is
              not a failure state. */}
          <AssistantQuestion fallback={question} />
        </Animated.View>

        <View style={styles.actions}>
          <Button
            label={
              hasEntryToday
                ? 'Add another moment'
                : capture === 'write'
                  ? 'Write today'
                  : 'Record today'
            }
            onPress={() =>
              router.push(capture === 'write' ? '/compose?mode=write' : '/compose?mode=video')
            }
            fullWidth
          />
          <PressableScale
            onPress={() =>
              router.push(capture === 'write' ? '/compose?mode=video' : '/compose?mode=write')
            }
            haptic="light"
            accessibilityLabel={capture === 'write' ? 'Record instead' : 'Write instead'}
            style={styles.writeInstead}
          >
            <Text variant="label" color="accent">
              {capture === 'write' ? 'or record it instead' : 'or write it down instead'}
            </Text>
          </PressableScale>
        </View>

        {memories.length > 0 && (
          <View style={styles.section}>
            <Text variant="overline" color="inkTertiary">
              On this day
            </Text>
            {memories.slice(0, 2).map((memory) => (
              <MemoryCard
                key={memory.id}
                entry={memory}
                onPress={() => router.push(`/entry/${memory.id}`)}
              />
            ))}
          </View>
        )}

        {threads.length > 0 && (
          <View style={styles.section}>
            <Text variant="overline" color="inkTertiary">
              What you are in the middle of
            </Text>
            {threads.slice(0, 4).map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                count={entries.filter((entry) => entry.threadId === thread.id).length}
                onPress={() => router.push(`/thread/${thread.id}`)}
              />
            ))}
          </View>
        )}

        {entries.length > 0 && (
          <View style={styles.section}>
            <Text variant="overline" color="inkTertiary">
              Recently
            </Text>
            {entries.slice(0, 5).map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                onPress={() => router.push(`/entry/${entry.id}`)}
              />
            ))}
          </View>
        )}

        {entries.length === 0 && (
          <View style={[styles.section, { marginTop: space.xxl }]}>
            <Text variant="callout" color="inkTertiary" style={styles.blank}>
              Nothing here yet. Whatever you record first will live here, and in a year it will find
              its way back to you.
            </Text>
          </View>
        )}
      </ScrollView>
    </DiaryPage>
  );
}

/** A story you are still living. Count, not streak — texture, never a score. */
function ThreadRow({
  thread,
  count,
  onPress,
}: {
  thread: Thread;
  count: number;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      accessibilityLabel={`Open the thread ${thread.title}`}
      style={styles.threadRow}
    >
      <Text variant="title3">{thread.title}</Text>
      <Text variant="caption" color="inkTertiary">
        {count === 0 ? 'Nothing in it yet' : `${String(count)} so far`}
        {thread.isPrivate ? ' · private' : ''}
      </Text>
    </PressableScale>
  );
}

function MemoryCard({ entry, onPress }: { entry: Entry; onPress: () => void }) {
  const theme = useTheme();
  const years = yearsAgo(fromDateKey(entry.entryDate));

  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      accessibilityLabel={`Memory from ${String(years)} years ago`}
      style={[
        styles.memory,
        { backgroundColor: theme.colors.accentWash, borderRadius: theme.radius.lg },
      ]}
    >
      <Text variant="caption" color="inkSecondary">
        {years === 1 ? 'A year ago today' : `${String(years)} years ago today`}
      </Text>
      <Text variant="title3" numberOfLines={3}>
        {entry.body.length > 0 ? entry.body : 'A moment you recorded'}
      </Text>
    </PressableScale>
  );
}

function EntryRow({ entry, onPress }: { entry: Entry; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      accessibilityLabel={`Entry from ${longDate(fromDateKey(entry.entryDate))}`}
      style={styles.row}
    >
      {/* A still, never the clip. Streaming video to render a scrolling list
          is slow here and expensive once this is server-backed. */}
      {(entry.videoUri !== undefined || entry.remoteVideoPath !== undefined) && (
        <VideoPoster posterUri={entry.posterUri} remotePath={entry.remotePosterPath} />
      )}

      <View style={styles.rowText}>
        <Text variant="caption" color="inkTertiary">
          {longDate(fromDateKey(entry.entryDate))}
        </Text>
        <Text variant="body" numberOfLines={2} color="ink">
          {entry.body.length > 0 ? entry.body : 'A recorded moment'}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.sm, marginTop: space.xl },
  blank: { maxWidth: 320 },
  content: { paddingRight: space.lg },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerRight: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  threadRow: { gap: space.xxs, paddingVertical: space.sm },
  memory: { gap: space.xxs, padding: space.md },
  opening: { gap: space.xs, marginTop: space.xs },
  row: { alignItems: 'center', flexDirection: 'row', gap: space.sm, paddingVertical: space.sm },
  rowText: { flex: 1, gap: space.xxs },
  section: { gap: space.sm, marginTop: space.xxl },
  writeInstead: { alignItems: 'center', paddingVertical: space.xs },
});
