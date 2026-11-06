import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Card, Icon, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import { canTranscribe, setMediaTranscript, type Entry } from '@/features/entries';

import { toDateKey } from '@/lib/date';

import { canTranscribeHere } from './engine';

/** Read once at load, like the runner's window; a day's drift changes nothing. */
const RECENT = toDateKey(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

/**
 * What was said in an entry's recordings.
 *
 * Folded by default when it is long: the recording is the entry, and the words
 * are there to search, skim and quote — not to replace watching it.
 */
export function TranscriptBlock({ entry }: { entry: Entry }) {
  const theme = useTheme();
  const recordings = entry.media.filter(canTranscribe);
  const [open, setOpen] = useState(false);

  if (recordings.length === 0) return null;

  const here = canTranscribeHere();
  const words = recordings
    .map((item) => item.transcript?.trim() ?? '')
    .filter((text) => text.length > 0)
    .join('\n\n');
  // The runner's own rule: anything asked for, plus untouched recordings from
  // the last month. Older ones wait for the button below.
  const listening = recordings.some(
    (item) =>
      item.uri !== undefined &&
      here.available &&
      (item.transcriptStatus === 'pending' ||
        (item.transcriptStatus === undefined && entry.entryDate >= RECENT)),
  );
  const failed = recordings.filter(
    (item) => item.transcriptStatus === 'failed' && item.uri !== undefined,
  );

  const retry = () => {
    for (const item of [...failed, ...recordings.filter((r) => r.transcriptStatus === undefined)]) {
      void setMediaTranscript(entry.id, item.id, { status: 'pending' });
    }
  };

  let status: string | null = null;
  if (words.length === 0) {
    if (listening) status = 'Turning what you said into words, on your phone…';
    else if (failed.length > 0) status = 'This one could not be transcribed.';
    else if (!here.available && here.reason === 'needs-full-build') {
      status =
        Platform.OS === 'web'
          ? 'Transcription happens on your phone, not in a browser.'
          : 'Transcription needs the full app build, not Expo Go.';
    } else if (!here.available) {
      status = 'Your phone cannot transcribe this language on its own yet.';
    } else if (recordings.every((item) => item.uri === undefined)) {
      status = 'Transcribed on the phone that recorded it.';
    } else if (recordings.some((item) => item.transcriptStatus === 'done')) {
      status = 'No words were heard in this recording.';
    }
  }

  const long = words.length > 280;

  return (
    <Card tone="surface" style={styles.card}>
      <View style={styles.header}>
        <Icon name="format-quote-open" size={18} color="accent" />
        <Text variant="overline" color="inkTertiary" style={styles.flex}>
          What you said
        </Text>
      </View>

      {words.length > 0 ? (
        <>
          <Text
            variant="callout"
            numberOfLines={long && !open ? 4 : undefined}
            style={{ fontFamily: theme.fontFamily.serifRegular }}
          >
            {words}
          </Text>
          {long && (
            <PressableScale
              onPress={() => setOpen(!open)}
              accessibilityLabel={open ? 'Show less' : 'Show all of what you said'}
            >
              <Text variant="caption" color="accent">
                {open ? 'Show less' : 'Show all'}
              </Text>
            </PressableScale>
          )}
        </>
      ) : (
        status !== null && (
          <Text variant="caption" color="inkTertiary">
            {status}
          </Text>
        )
      )}

      {here.available &&
        !listening &&
        (failed.length > 0 ||
          recordings.some(
            (item) => item.uri !== undefined && item.transcriptStatus === undefined,
          )) && (
          <PressableScale onPress={retry} accessibilityLabel="Transcribe this recording">
            <Text variant="label" color="accent">
              {failed.length > 0 ? 'Try again' : 'Transcribe'}
            </Text>
          </PressableScale>
        )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.xs },
  flex: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
});
