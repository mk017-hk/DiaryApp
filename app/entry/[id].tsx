import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, DiaryPage, ErrorState, Icon, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import {
  audioOf,
  deleteEntry,
  EmotionPicker,
  getEntry,
  getThread,
  photosOf,
  updateEntry,
  videoOf,
  type Entry,
  type Thread,
} from '@/features/entries';
import { deleteRecording, PhotoNote, VideoNote, VoiceNote } from '@/features/media';
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
  /** The words and mood being edited, or null when reading. */
  const [draft, setDraft] = useState<{ body: string; mood: number | null } | null>(null);
  const [saving, setSaving] = useState(false);

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
  const video = videoOf(entry);
  const voice = audioOf(entry);
  const photos = photosOf(entry);

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

  // One tap used to delete outright. A diary entry may be the only record of
  // a day; losing one to a mis-tap on the way to the back button is not a
  // mistake an app should let anyone make.
  const confirmRemove = () =>
    Alert.alert(
      'Delete this entry?',
      'It goes from this phone and from your account, with anything recorded in it. This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void remove() },
      ],
    );

  /**
   * Saving an edit.
   *
   * The entry keeps its date and its place: editing what you wrote about a
   * Tuesday does not move it to today. Sync carries the change because
   * `updateEntry` marks it unsynced with a new authoring time.
   */
  const saveEdit = async () => {
    if (draft === null) return;
    setSaving(true);
    const updated = await updateEntry(entry.id, { body: draft.body.trim(), mood: draft.mood });
    setSaving(false);
    if (updated !== null) setEntry(updated);
    setDraft(null);
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
            <Icon name="chevron-left" size={28} color="ink" />
          </PressableScale>

          <View style={styles.headerActions}>
            {draft === null && (
              <PressableScale
                onPress={() => setDraft({ body: entry.body, mood: entry.mood })}
                haptic="light"
                accessibilityLabel="Edit this entry"
              >
                <Icon name="pencil-outline" size={24} color="inkSecondary" />
              </PressableScale>
            )}
            <PressableScale
              onPress={() => void toggleFavourite()}
              haptic="light"
              accessibilityLabel={entry.isFavourite ? 'Remove from saved' : 'Save this moment'}
              accessibilityState={{ selected: entry.isFavourite }}
            >
              <Icon
                name={entry.isFavourite ? 'bookmark' : 'bookmark-outline'}
                size={24}
                color={entry.isFavourite ? 'accent' : 'inkSecondary'}
              />
            </PressableScale>
          </View>
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

        {/* Video first, then the voice note, then photos — the order they
            were likely made in, and the order of how much attention each
            wants. Either a local file or a bucket path is enough to play
            from; `useMediaSource` prefers the file. */}
        {video !== undefined && (
          <View style={styles.videoNote}>
            <VideoNote item={video} />
          </View>
        )}

        {voice !== undefined && (
          <View style={styles.attachment}>
            <VoiceNote item={voice} />
          </View>
        )}

        {photos.length > 0 && (
          <View style={styles.photos}>
            {photos.map((photo) => (
              <PhotoNote key={photo.id} item={photo} />
            ))}
          </View>
        )}

        {draft !== null ? (
          <View style={styles.editing}>
            <TextInput
              value={draft.body}
              onChangeText={(body) => setDraft({ ...draft, body })}
              multiline
              autoFocus
              textAlignVertical="top"
              placeholder="Anything you want to add?"
              placeholderTextColor={theme.colors.inkFaint}
              accessibilityLabel="Your entry"
              style={[
                styles.writing,
                styles.editor,
                {
                  color: theme.colors.ink,
                  fontFamily: theme.fontFamily.serifRegular,
                  backgroundColor: theme.colors.surface,
                  borderRadius: theme.radius.md,
                },
              ]}
            />
            <Text variant="overline" color="inkTertiary">
              How was it?
            </Text>
            <View style={styles.moods}>
              {Object.entries(MOOD_LABELS).map(([value, label]) => (
                <Chip
                  key={value}
                  label={label}
                  selected={draft.mood === Number(value)}
                  onPress={() =>
                    setDraft({
                      ...draft,
                      mood: draft.mood === Number(value) ? null : Number(value),
                    })
                  }
                />
              ))}
            </View>
            <View style={styles.editActions}>
              <Button
                label="Save changes"
                onPress={() => void saveEdit()}
                loading={saving}
                disabled={draft.body.trim().length === 0 && entry.media.length === 0}
              />
              <Button label="Cancel" variant="ghost" onPress={() => setDraft(null)} />
            </View>
          </View>
        ) : (
          entry.body.length > 0 && (
            <Text
              variant="body"
              style={[styles.writing, { fontFamily: theme.fontFamily.serifRegular }]}
            >
              {entry.body}
            </Text>
          )
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

        <View style={styles.quiet}>
          {/* Settable after the fact as well as at capture, because this is
              usually something you realise later — often on the morning the
              app hands it back to you. */}
          <PressableScale
            onPress={() => {
              const next = entry.resurfaceExcluded !== true;
              setEntry({ ...entry, resurfaceExcluded: next });
              void updateEntry(entry.id, { resurfaceExcluded: next });
            }}
            haptic="selection"
            accessibilityLabel="Never bring this one back to me"
            accessibilityState={{ checked: entry.resurfaceExcluded === true }}
            style={[
              styles.toggle,
              {
                backgroundColor:
                  entry.resurfaceExcluded === true ? theme.colors.accentWash : 'transparent',
                borderRadius: theme.radius.md,
              },
            ]}
          >
            <Text
              variant="caption"
              color={entry.resurfaceExcluded === true ? 'accent' : 'inkTertiary'}
            >
              {entry.resurfaceExcluded === true ? '✓ ' : ''}Never bring this one back to me
            </Text>
          </PressableScale>
        </View>

        <View style={styles.footer}>
          <Button label="Delete this entry" onPress={confirmRemove} variant="danger" />
        </View>
      </ScrollView>
    </DiaryPage>
  );
}

const styles = StyleSheet.create({
  content: { paddingRight: space.lg },
  dateBlock: { gap: space.xxs, marginTop: space.lg },
  footer: { marginTop: space.xxxl },
  quiet: { marginTop: space.xxl },
  toggle: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  editActions: { flexDirection: 'row', gap: space.xs, marginTop: space.md },
  editing: { gap: space.sm },
  editor: { minHeight: 180, padding: space.md },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', gap: space.lg },
  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  threadLink: { alignSelf: 'flex-start', paddingVertical: space.xxs },
  attachment: { marginTop: space.lg },
  photos: { gap: space.sm, marginTop: space.lg },
  videoNote: { marginTop: space.lg },
  writing: { fontSize: 19, lineHeight: 32, marginTop: space.lg },
});
