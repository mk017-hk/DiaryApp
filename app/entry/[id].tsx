import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, DiaryPage, ErrorState, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import {
  deleteEntry,
  EmotionPicker,
  getEntry,
  getThread,
  updateEntry,
  type Entry,
  type Thread,
} from '@/features/entries';
import { deleteRecording, VideoNote } from '@/features/media';
import { fromDateKey, fullDate, longDate } from '@/lib/date';

const MOOD_LABELS: Record<number, string> = {
  1: 'Heavy',
  2: 'Low',
  3: 'Even',
  4: 'Good',
  5: 'Bright',
};

/**
 * Opening an old entry.
 *
 * Reads like a page in a book you kept: the date set as a heading, your words
 * in serif beneath it. Actions stay out of the way until you look for them —
 * arriving at a memory should not feel like arriving at a record with buttons.
 */
export default function EntryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [entry, setEntry] = useState<Entry | null | 'loading'>('loading');
  const [thread, setThread] = useState<Thread | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await getEntry(id);
      if (cancelled) return;
      setEntry(found);

      const story =
        found !== null && found.threadId !== undefined ? await getThread(found.threadId) : null;
      if (!cancelled) setThread(story);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (entry === 'loading') return <DiaryPage />;

  if (entry === null) {
    return (
      <DiaryPage ruled={false}>
        <ErrorState
          title="That entry is gone"
          message="It may have been deleted."
          onRetry={() => router.back()}
          retryLabel="Go back"
        />
      </DiaryPage>
    );
  }

  const date = fromDateKey(entry.entryDate);

  const toggleFavourite = async () => {
    const updated = await updateEntry(entry.id, { isFavourite: !entry.isFavourite });
    if (updated !== null) setEntry(updated);
  };

  const remove = async () => {
    // Files go too. Orphaned video is invisible to the user but keeps taking
    // up their storage, and it is their diary — deleting should mean deleting.
    await deleteRecording(entry.id);
    await deleteEntry(entry.id);
    router.back();
  };

  return (
    <DiaryPage>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <PressableScale onPress={() => router.back()} haptic="light" accessibilityLabel="Back">
            <Text variant="callout" color="inkTertiary">
              ‹ Back
            </Text>
          </PressableScale>

          <PressableScale
            onPress={() => void toggleFavourite()}
            haptic="light"
            accessibilityLabel={entry.isFavourite ? 'Remove from saved' : 'Save this moment'}
            accessibilityState={{ selected: entry.isFavourite }}
          >
            <Text variant="callout" color={entry.isFavourite ? 'accent' : 'inkTertiary'}>
              {entry.isFavourite ? 'Saved' : 'Save'}
            </Text>
          </PressableScale>
        </View>

        <View style={styles.dateBlock}>
          <Text variant="title2">{longDate(date)}</Text>
          <Text variant="caption" color="inkTertiary">
            {fullDate(date)}
            {entry.mood !== null ? ` · ${MOOD_LABELS[entry.mood] ?? ''}` : ''}
          </Text>

          {/* Which story this belongs to, and a way into the rest of it. */}
          {thread !== null && (
            <PressableScale
              onPress={() => router.push(`/thread/${thread.id}`)}
              haptic="light"
              accessibilityLabel={`Open the thread ${thread.title}`}
              style={styles.threadLink}
            >
              <Text variant="caption" color="accent">
                Part of {thread.title} ›
              </Text>
            </PressableScale>
          )}
        </View>

        {/* Either half is enough to show a player: this phone has the file, or
            the account has it and a signed URL will fetch it. */}
        {(entry.videoUri !== undefined || entry.remoteVideoPath !== undefined) && (
          <View style={styles.videoNote}>
            <VideoNote uri={entry.videoUri} remotePath={entry.remoteVideoPath} />
          </View>
        )}

        {entry.body.length > 0 && (
          <Text
            variant="body"
            style={[styles.writing, { fontFamily: theme.fontFamily.serifRegular }]}
          >
            {entry.body}
          </Text>
        )}

        {/* Editable here, not just displayed. What a day felt like is often
            clearer a week later than it was at the time. */}
        <EmotionPicker
          selected={entry.emotions}
          onChange={(emotions) => {
            setEntry({ ...entry, emotions });
            void updateEntry(entry.id, { emotions });
          }}
        />

        <View style={styles.footer}>
          <Button label="Delete this entry" onPress={() => void remove()} variant="danger" />
        </View>
      </ScrollView>
    </DiaryPage>
  );
}

const styles = StyleSheet.create({
  content: { paddingRight: space.lg },
  dateBlock: { gap: space.xxs, marginTop: space.lg },
  footer: { marginTop: space.xxxl },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  threadLink: { alignSelf: 'flex-start', paddingVertical: space.xxs },
  videoNote: { marginTop: space.lg },
  writing: { fontSize: 19, lineHeight: 32, marginTop: space.lg },
});
