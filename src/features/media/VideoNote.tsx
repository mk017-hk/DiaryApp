import { useVideoPlayer, VideoView } from 'expo-video';
import { Image, StyleSheet, View } from 'react-native';

import { PressableScale, Skeleton, Text } from '@/components';
import { useTheme } from '@/design';

import { useMediaSource } from './useMediaSource';

interface VideoNoteProps {
  /** The file on this device, if this is the phone that recorded it. */
  uri?: string | undefined;
  /** Where it lives in the bucket, for every other device. */
  remotePath?: string | undefined;
}

/**
 * Watching a recorded entry back.
 *
 * Starts paused on its first frame rather than autoplaying. Opening an old
 * memory should be something you choose, not something that begins talking at
 * you — particularly if someone else is in the room.
 */
export function VideoNote({ uri, remotePath }: VideoNoteProps) {
  const theme = useTheme();
  const source = useMediaSource(uri, remotePath);

  const player = useVideoPlayer(source.state === 'ready' ? source.uri : null, (instance) => {
    instance.loop = false;
    instance.muted = false;
  });

  if (source.state === 'resolving') {
    return <Skeleton style={[styles.frame, { borderRadius: theme.radius.lg }]} />;
  }

  if (source.state === 'unavailable') {
    return (
      <View
        style={[
          styles.missing,
          { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.lg },
        ]}
      >
        <Text variant="callout" color="inkSecondary" align="center">
          This recording is not on this device, and we could not reach your account to fetch it.
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
  remotePath,
  onPress,
  label = 'Play recording',
}: {
  posterUri?: string | undefined;
  remotePath?: string | undefined;
  onPress?: () => void;
  label?: string;
}) {
  const theme = useTheme();
  const source = useMediaSource(posterUri, remotePath);

  // The placeholder covers both "no still was ever made" and "still fetching
  // one". A row in a list is the wrong place for a spinner: it would make a
  // quiet timeline flicker every time it scrolled past.
  const resolved = source.state === 'ready' ? source.uri : undefined;

  const content =
    resolved === undefined ? (
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
        source={{ uri: resolved }}
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
