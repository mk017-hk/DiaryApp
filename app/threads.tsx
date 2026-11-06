import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, PressableScale, Screen, SectionHeader, Text } from '@/components';
import { space } from '@/design';
import {
  listEntries,
  listThreads,
  useEntryChanges,
  type Entry,
  type Thread,
} from '@/features/entries';
import { fromDateKey, fullDate } from '@/lib/date';

/**
 * Every thread, open and closed.
 *
 * Today shows the few you are in the middle of. This is the rest: the stories
 * that have ended stay here, findable, rather than only reachable through an
 * entry that happened to belong to one.
 */
export default function Threads() {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);

  const load = useCallback(async () => {
    const [all, written] = await Promise.all([listThreads(), listEntries()]);
    setThreads(all);
    setEntries(written);
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEntryChanges(() => void load());

  const open = threads.filter((thread) => thread.status === 'open');
  const closed = threads.filter((thread) => thread.status === 'closed');

  const row = (thread: Thread) => {
    const count = entries.filter((entry) => entry.threadId === thread.id).length;
    return (
      <Card
        key={thread.id}
        onPress={() => router.push(`/thread/${thread.id}`)}
        accessibilityLabel={`Open the thread ${thread.title}`}
      >
        <View style={styles.row}>
          <Icon
            name={thread.status === 'open' ? 'book-open-page-variant-outline' : 'book-outline'}
            color="accent"
          />
          <View style={styles.flex}>
            <Text variant="bodyMedium">{thread.title}</Text>
            <Text variant="caption" color="inkTertiary">
              {count === 0
                ? 'Nothing in it yet'
                : count === 1
                  ? '1 entry'
                  : `${String(count)} entries`}
              {` · since ${fullDate(fromDateKey(thread.startedOn))}`}
              {thread.isPrivate ? ' · private' : ''}
            </Text>
          </View>
          <Icon name="chevron-right" color="inkFaint" />
        </View>
      </Card>
    );
  };

  return (
    <Screen scroll padded>
      <View style={styles.page}>
        <View style={styles.header}>
          <PressableScale onPress={() => router.back()} accessibilityLabel="Back">
            <Icon name="chevron-left" size={28} color="ink" />
          </PressableScale>
          <Text variant="title2">Threads</Text>
        </View>

        <Text variant="callout" color="inkSecondary">
          A thread is a story you keep coming back to — a move, a pregnancy, a year of grief, a new
          job. Start one from any entry.
        </Text>

        {threads.length === 0 && (
          <Card tone="surface">
            <Text variant="callout" color="inkSecondary">
              No threads yet. When you write an entry, tap “Start one” under “Part of a bigger
              story?” to begin one.
            </Text>
          </Card>
        )}

        {open.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Still going" />
            {open.map(row)}
          </View>
        )}

        {closed.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Closed" />
            {closed.map(row)}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  header: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  page: { gap: space.md, paddingBottom: space.xxl, paddingTop: space.md },
  row: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  section: { gap: space.sm },
});
