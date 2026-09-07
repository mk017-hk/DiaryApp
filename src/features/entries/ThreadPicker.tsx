import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip, Field, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import { toDateKey } from '@/lib/date';

import { createThread, openThreads, subscribeToThreads, type Thread } from './threadStore';

interface ThreadPickerProps {
  selected: string | undefined;
  onChange: (threadId: string | undefined) => void;
}

/**
 * One quiet question: is this part of something you are already writing about?
 *
 * Threads are what let the app follow a story rather than react to yesterday —
 * "trying again", "the move", "the first year". Optional, unlabelled as a
 * feature, and invisible until you have one, because a picker showing an empty
 * list is a chore rather than an offer.
 */
export function ThreadPicker({ selected, onChange }: ThreadPickerProps) {
  const theme = useTheme();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [starting, setStarting] = useState(false);
  const [title, setTitle] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    const load = () => void openThreads().then(setThreads);
    load();
    return subscribeToThreads(load);
  }, []);

  const start = async () => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;

    const thread = await createThread({
      title: trimmed,
      isPrivate,
      startedOn: toDateKey(new Date()),
    });

    onChange(thread.id);
    setStarting(false);
    setTitle('');
    setIsPrivate(false);
  };

  return (
    <View style={styles.section}>
      <Text variant="overline" color="inkTertiary">
        {threads.length === 0 ? 'Part of a bigger story?' : 'Is this part of something?'}
      </Text>

      {threads.length > 0 && (
        <View style={styles.chips}>
          {threads.map((thread) => (
            <Chip
              key={thread.id}
              label={thread.isPrivate ? `${thread.title} · private` : thread.title}
              selected={selected === thread.id}
              onPress={() => onChange(selected === thread.id ? undefined : thread.id)}
            />
          ))}
        </View>
      )}

      {starting ? (
        <View style={styles.form}>
          <Field
            label="What would you call it?"
            value={title}
            onChangeText={setTitle}
            placeholder="Trying again"
            autoFocus
            maxLength={120}
            returnKeyType="done"
            onSubmitEditing={() => void start()}
          />

          {/* Stated in plain words at the moment it matters, not buried in
              settings. Someone starting a thread about a loss should be told
              here that they can keep it out of the assistant entirely. */}
          <PressableScale
            onPress={() => setIsPrivate(!isPrivate)}
            haptic="selection"
            accessibilityLabel="Keep this thread private"
            accessibilityState={{ checked: isPrivate }}
            style={[
              styles.private,
              {
                backgroundColor: isPrivate ? theme.colors.accentWash : 'transparent',
                borderRadius: theme.radius.md,
              },
            ]}
          >
            <Text variant="caption" color={isPrivate ? 'accent' : 'inkTertiary'}>
              {isPrivate ? '✓ ' : ''}Keep this one private — the assistant never reads it
            </Text>
          </PressableScale>

          <View style={styles.formActions}>
            <PressableScale
              onPress={() => void start()}
              haptic="light"
              accessibilityLabel="Start this thread"
            >
              <Text variant="label" color={title.trim().length > 0 ? 'accent' : 'inkFaint'}>
                Start it
              </Text>
            </PressableScale>
            <PressableScale
              onPress={() => {
                setStarting(false);
                setTitle('');
              }}
              haptic="light"
              accessibilityLabel="Cancel"
            >
              <Text variant="label" color="inkTertiary">
                Cancel
              </Text>
            </PressableScale>
          </View>
        </View>
      ) : (
        <PressableScale
          onPress={() => setStarting(true)}
          haptic="light"
          accessibilityLabel="Start a new thread"
          style={styles.start}
        >
          <Text variant="caption" color="accent">
            {threads.length === 0 ? 'Start one' : 'Or start a new one'}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  form: { gap: space.sm, marginTop: space.xs },
  formActions: { flexDirection: 'row', gap: space.lg },
  private: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  section: { gap: space.xs, marginTop: space.lg },
  start: { alignSelf: 'flex-start', paddingVertical: space.xxs },
});
