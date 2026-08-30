import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, DiaryPage, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import { dailyPrompt, personalGreeting } from '@/features/assistant/prompts';
import { listEntries, onThisDay, type Entry } from '@/features/entries/entryStore';
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
  const { name } = useProfile();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [memories, setMemories] = useState<Entry[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const [all, resurfaced] = await Promise.all([listEntries(), onThisDay()]);
        if (cancelled) return;
        setEntries(all);
        setMemories(resurfaced);
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const todayKey = toDateKey(new Date());
  const hasEntryToday = entries.some((entry) => entry.entryDate === todayKey);
  const latest = entries[0];
  const daysSinceLast =
    latest === undefined
      ? null
      : Math.round((Date.now() - fromDateKey(latest.entryDate).getTime()) / (1000 * 60 * 60 * 24));

  const question = dailyPrompt({ name, daysSinceLast, hasEntryToday });

  return (
    <DiaryPage>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="caption" color="inkTertiary">
          {longDate(new Date())}
        </Text>

        <Animated.View entering={FadeInDown.duration(400)} style={styles.opening}>
          <Text variant="title3" color="inkSecondary">
            {personalGreeting(name)}
          </Text>
          <Text variant="display" lineHeight={46}>
            {question}
          </Text>
        </Animated.View>

        <View style={styles.actions}>
          <Button
            label={hasEntryToday ? 'Add another moment' : 'Record today'}
            onPress={() => router.push('/compose?mode=video')}
            fullWidth
          />
          <PressableScale
            onPress={() => router.push('/compose?mode=write')}
            haptic="light"
            accessibilityLabel="Write instead"
            style={styles.writeInstead}
          >
            <Text variant="label" color="accent">
              or write it down instead
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
  const theme = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      accessibilityLabel={`Entry from ${longDate(fromDateKey(entry.entryDate))}`}
      style={styles.row}
    >
      <View style={styles.rowHeader}>
        <Text variant="caption" color="inkTertiary">
          {longDate(fromDateKey(entry.entryDate))}
        </Text>
        {entry.videoUri !== undefined && (
          <View style={[styles.badge, { backgroundColor: theme.colors.accentSoft }]} />
        )}
      </View>
      <Text variant="body" numberOfLines={2} color="ink">
        {entry.body.length > 0 ? entry.body : 'A recorded moment'}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.sm, marginTop: space.xl },
  badge: { borderRadius: 3, height: 6, width: 6 },
  blank: { maxWidth: 320 },
  content: { paddingRight: space.lg },
  memory: { gap: space.xxs, padding: space.md },
  opening: { gap: space.xs, marginTop: space.xs },
  row: { gap: space.xxs, paddingVertical: space.sm },
  rowHeader: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  section: { gap: space.sm, marginTop: space.xxl },
  writeInstead: { alignItems: 'center', paddingVertical: space.xs },
});
