import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, DiaryPage, Divider, ErrorState, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import {
  getThread,
  listEntries,
  updateThread,
  useEntryChanges,
  type Entry,
  type Thread,
} from '@/features/entries';
import { VideoPoster } from '@/features/media';
import { fromDateKey, longDate } from '@/lib/date';

/**
 * One story, in order.
 *
 * Oldest first, deliberately — everywhere else in the app is newest first,
 * because that is how you catch up. A thread is the opposite: you read it to
 * see how something went, and that only makes sense forwards.
 */
export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [thread, setThread] = useState<Thread | null | 'loading'>('loading');
  const [entries, setEntries] = useState<Entry[]>([]);

  const load = useCallback(async () => {
    if (id === undefined) return;
    const [found, all] = await Promise.all([getThread(id), listEntries()]);

    setThread(found);
    setEntries(
      all
        .filter((entry) => entry.threadId === id)
        .sort((a, b) => a.entryAt.localeCompare(b.entryAt)),
    );
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEntryChanges(() => void load());

  if (thread === 'loading') return <DiaryPage />;

  if (thread === null) {
    return (
      <DiaryPage>
        <ErrorState
          title="We couldn't find that thread"
          message="It may have been removed on another device."
          onRetry={() => router.back()}
          retryLabel="Go back"
        />
      </DiaryPage>
    );
  }

  const closed = thread.status === 'closed';

  return (
    <DiaryPage>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <PressableScale onPress={() => router.back()} haptic="light" accessibilityLabel="Back">
          <Text variant="callout" color="inkTertiary">
            ‹ Back
          </Text>
        </PressableScale>

        <View style={styles.heading}>
          <Text variant="display" lineHeight={44}>
            {thread.title}
          </Text>
          <Text variant="caption" color="inkTertiary">
            Since {longDate(fromDateKey(thread.startedOn))}
            {entries.length > 0
              ? ` · ${String(entries.length)} ${entries.length === 1 ? 'entry' : 'entries'}`
              : ''}
            {closed ? ' · closed' : ''}
          </Text>

          {thread.isPrivate && (
            <View
              style={[
                styles.privateNote,
                { backgroundColor: theme.colors.accentWash, borderRadius: theme.radius.md },
              ]}
            >
              <Text variant="caption" color="inkSecondary">
                Private. Nothing in this thread is ever read by the assistant.
              </Text>
            </View>
          )}
        </View>

        <Divider />

        {entries.length === 0 ? (
          <Text variant="callout" color="inkTertiary" style={styles.blank}>
            Nothing in this thread yet. Anything you write can be added to it.
          </Text>
        ) : (
          entries.map((entry) => (
            <PressableScale
              key={entry.id}
              onPress={() => router.push(`/entry/${entry.id}`)}
              haptic="light"
              accessibilityLabel={`Entry from ${longDate(fromDateKey(entry.entryDate))}`}
              style={styles.row}
            >
              {(entry.videoUri !== undefined || entry.remoteVideoPath !== undefined) && (
                <VideoPoster posterUri={entry.posterUri} remotePath={entry.remotePosterPath} />
              )}
              <View style={styles.rowText}>
                <Text variant="caption" color="inkTertiary">
                  {longDate(fromDateKey(entry.entryDate))}
                </Text>
                <Text variant="body" numberOfLines={3}>
                  {entry.body.length > 0 ? entry.body : 'A recorded moment'}
                </Text>
              </View>
            </PressableScale>
          ))
        )}

        <View style={styles.footer}>
          <Divider />
          {/* Closed, never deleted. A story that ended is still part of the
              record, and the entries in it belong to the diary either way. */}
          <Button
            label={closed ? 'Open it again' : 'Close this thread'}
            variant="secondary"
            onPress={() => {
              const next = closed ? 'open' : 'closed';
              setThread({ ...thread, status: next });
              void updateThread(thread.id, { status: next });
            }}
            fullWidth
          />
          <Text variant="caption" color="inkTertiary">
            Closing keeps everything. It just stops the thread being offered when you write.
          </Text>
        </View>
      </ScrollView>
    </DiaryPage>
  );
}

const styles = StyleSheet.create({
  blank: { marginTop: space.lg, maxWidth: 320 },
  content: { paddingRight: space.lg },
  footer: { gap: space.sm, marginTop: space.xxxl },
  heading: { gap: space.xs, marginTop: space.lg },
  privateNote: { marginTop: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm },
  row: { alignItems: 'center', flexDirection: 'row', gap: space.sm, paddingVertical: space.md },
  rowText: { flex: 1, gap: space.xxs },
});
