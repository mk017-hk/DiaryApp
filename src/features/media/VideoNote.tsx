import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components';
import { useTheme } from '@/design';

import { recordingExists } from './videoStorage';

interface VideoNoteProps {
  uri: string;
}

/**
 * Watching a recorded entry back.
 *
 * Starts paused on its first frame rather than autoplaying. Opening an old
 * memory should be something you choose, not something that begins talking at
 * you — particularly if someone else is in the room.
 */
export function VideoNote({ uri }: VideoNoteProps) {
  const theme = useTheme();
  const [available] = useState(() => recordingExists(uri));

  const player = useVideoPlayer(available ? uri : null, (instance) => {
    instance.loop = false;
    instance.muted = false;
  });

  if (!available) {
    return (
      <View
        style={[
          styles.missing,
          { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.lg },
        ]}
      >
        <Text variant="callout" color="inkSecondary" align="center">
          This recording is no longer on this device.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { borderRadius: theme.radius.lg }]}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture={false}
        contentFit="cover"
        accessibilityLabel="Your recorded entry"
      />
    </View>
  );
}

/**
 * A still, for lists. Renders the poster if there is one, and a quiet
 * placeholder if the frame could not be extracted.
 */
export function VideoPoster({
  posterUri,
  onPress,
  label = 'Play recording',
}: {
  posterUri?: string | undefined;
  onPress?: () => void;
  label?: string;
}) {
  const theme = useTheme();

  const content =
    posterUri === undefined ? (
      <View
        style={[
          styles.poster,
          { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.md },
        ]}
      >
        <View style={[styles.playDot, { backgroundColor: theme.colors.accentSoft }]} />
      </View>
    ) : (
      <Image
        source={{ uri: posterUri }}
        style={[styles.poster, { borderRadius: theme.radius.md }]}
        accessibilityIgnoresInvertColors
      />
    );

  if (onPress === undefined) return content;

  return (
    <PressableScale onPress={onPress} haptic="light" accessibilityLabel={label}>
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 3 / 4, overflow: 'hidden', width: '100%' },
  missing: { alignItems: 'center', justifyContent: 'center', minHeight: 120, padding: 24 },
  playDot: { borderRadius: 5, height: 10, width: 10 },
  poster: { alignItems: 'center', height: 64, justifyContent: 'center', width: 64 },
  video: { height: '100%', width: '100%' },
});
