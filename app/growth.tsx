import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, PressableScale, Screen, SectionHeader, Text } from '@/components';
import { space, useTheme } from '@/design';
import { useCycle } from '@/features/cycle';
import {
  listEntries,
  listThreads,
  useEntryChanges,
  type Entry,
  type Thread,
} from '@/features/entries';
import { feelingsByMonth, namesMentioned, recurringWords, type Count } from '@/features/growth';
import { fromDateKey, fullDate, monthName } from '@/lib/date';
import { DEFAULT_EMOTIONS } from '@/services/supabase/emotions';

/**
 * Growth.
 *
 * The people, places and words a diary keeps returning to, the stories it has
 * held, and what each month felt like — all read from what she wrote, on this
 * phone. Tap anything to find every entry it came from.
 *
 * It describes. It does not rank people, interpret words, or tell her she has
 * grown; whether she has is hers to say.
 */
export default function Growth() {
  const router = useRouter();
  const theme = useTheme();
  const { logs } = useCycle();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);

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

  const names = useMemo(() => namesMentioned(entries), [entries]);
  const themes = useMemo(() => recurringWords(entries), [entries]);
  const months = useMemo(
    () => feelingsByMonth(entries, [...logs.values()]).slice(0, 6),
    [entries, logs],
  );

  const find = (word: string) => router.push(`/search?q=${encodeURIComponent(word)}`);

  return (
    <Screen scroll padded>
      <View style={styles.page}>
        <View style={styles.header}>
          <PressableScale onPress={() => router.back()} accessibilityLabel="Back">
            <Icon name="chevron-left" size={28} color="ink" />
          </PressableScale>
          <Text variant="title2">Growth</Text>
        </View>

        {entries.length < 3 ? (
          <Card tone="surface">
            <Text variant="callout" color="inkSecondary">
              This fills in as you write. After a few weeks it will show the names and words you
              come back to, and what each month felt like.
            </Text>
          </Card>
        ) : (
          <>
            <View>
              <SectionHeader title="Names you mention" />
              <Cloud
                items={names}
                empty="No names yet — they appear once one turns up in two entries."
                onPress={find}
              />
            </View>

            <View>
              <SectionHeader title="What you keep writing about" />
              <Cloud items={themes} empty="Nothing recurring yet." onPress={find} />
            </View>

            {months.length > 0 && (
              <View>
                <SectionHeader title="How each month felt" />
                <Card>
                  {months.map((month, index) => {
                    const [year, m] = month.month.split('-').map(Number);
                    return (
                      <View
                        key={month.month}
                        style={[
                          styles.month,
                          index > 0 && {
                            borderTopColor: theme.colors.border,
                            borderTopWidth: StyleSheet.hairlineWidth,
                          },
                        ]}
                      >
                        <Text variant="bodyMedium" style={styles.monthName}>
                          {monthName((m ?? 1) - 1)} {String(year)}
                        </Text>
                        <Text variant="callout" color="inkSecondary" style={styles.flex}>
                          {month.top.map((item) => emotionLabel(item.word)).join(', ')}
                        </Text>
                      </View>
                    );
                  })}
                </Card>
              </View>
            )}
          </>
        )}

        {threads.length > 0 && (
          <View>
            <SectionHeader
              title="Stories you have kept"
              action={{ label: 'All', onPress: () => router.push('/threads') }}
            />
            <Card>
              {threads.slice(0, 6).map((thread, index) => {
                const count = entries.filter((entry) => entry.threadId === thread.id).length;
                return (
                  <PressableScale
                    key={thread.id}
                    onPress={() => router.push(`/thread/${thread.id}`)}
                    accessibilityLabel={`Open the thread ${thread.title}`}
                    style={[
                      styles.thread,
                      index > 0 && {
                        borderTopColor: theme.colors.border,
                        borderTopWidth: StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <View style={styles.flex}>
                      <Text variant="bodyMedium">{thread.title}</Text>
                      <Text variant="caption" color="inkTertiary">
                        Since {fullDate(fromDateKey(thread.startedOn))} ·{' '}
                        {count === 1 ? '1 entry' : `${String(count)} entries`}
                        {thread.status === 'closed' ? ' · closed' : ''}
                      </Text>
                    </View>
                    <Icon name="chevron-right" color="inkFaint" />
                  </PressableScale>
                );
              })}
            </Card>
          </View>
        )}

        <Text variant="caption" color="inkTertiary">
          Worked out on this phone from your own words. Nothing here is sent anywhere.
        </Text>
      </View>
    </Screen>
  );
}

function emotionLabel(slug: string): string {
  return DEFAULT_EMOTIONS.find((emotion) => emotion.slug === slug)?.label ?? slug;
}

/** Words as chips, the most frequent drawn a little larger. */
function Cloud({
  items,
  empty,
  onPress,
}: {
  items: Count[];
  empty: string;
  onPress: (word: string) => void;
}) {
  const theme = useTheme();
  if (items.length === 0) {
    return (
      <Text variant="callout" color="inkTertiary">
        {empty}
      </Text>
    );
  }
  const top = items[0]?.count ?? 1;
  return (
    <View style={styles.cloud}>
      {items.map((item) => {
        const strong = item.count >= Math.max(2, top * 0.6);
        return (
          <PressableScale
            key={item.word}
            onPress={() => onPress(item.word)}
            haptic="light"
            accessibilityLabel={`${item.word}, in ${String(item.count)} entries. Find them.`}
            style={[
              styles.word,
              { backgroundColor: strong ? theme.colors.accentWash : theme.colors.surface },
            ]}
          >
            <Text variant={strong ? 'bodyMedium' : 'label'} color={strong ? 'accent' : 'ink'}>
              {item.word}
            </Text>
            <Text variant="caption" color="inkTertiary">
              {item.count}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cloud: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  flex: { flex: 1, gap: 2 },
  header: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  month: { flexDirection: 'row', gap: space.sm, paddingVertical: space.sm },
  monthName: { width: 150 },
  page: { gap: space.lg, paddingBottom: space.xxl, paddingTop: space.md },
  thread: { alignItems: 'center', flexDirection: 'row', gap: space.sm, paddingVertical: space.sm },
  word: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: space.xxs,
    minHeight: 40,
    paddingHorizontal: space.md,
  },
});
