import { useVideoPlayer, VideoView } from 'expo-video';
import { Image, StyleSheet, View } from 'react-native';

import { PressableScale, Skeleton, Text } from '@/components';
import { useTheme } from '@/design';
import type { EntryMedia } from '@/features/entries/entryStore';

import { useMediaSource } from './useMediaSource';

/**
 * Watching a recorded entry back.
 *
 * Starts paused on its first frame rather than autoplaying. Opening an old
 * memory should be something you choose, not something that begins talking at
 * you — particularly if someone else is in the room.
 */
export function VideoNote({ item }: { item: EntryMedia }) {
  const theme = useTheme();
  const source = useMediaSource(item.uri, item.remotePath);

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
 * A still, for lists.
 *
 * Renders the poster frame for a video and the image itself for a photo, and a
 * quiet placeholder while either is being fetched — a row in a list is the
 * wrong place for a spinner, which would make a calm timeline flicker every
 * time it scrolled.
 */
export function VideoPoster({
  item,
  onPress,
  label = 'Open',
}: {
  item: EntryMedia | undefined;
  onPress?: () => void;
  label?: string;
}) {
  const theme = useTheme();

  // A photo is its own thumbnail; a video has a separate poster frame.
  const localStill = item?.kind === 'photo' ? item.uri : item?.posterUri;
  const remoteStill = item?.kind === 'photo' ? item.remotePath : item?.remotePosterPath;
  const source = useMediaSource(localStill, remoteStill);
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

/** A photo, at full width. */
export function PhotoNote({ item }: { item: EntryMedia }) {
  const theme = useTheme();
  const source = useMediaSource(item.uri, item.remotePath);

  if (source.state === 'resolving') {
    return <Skeleton style={[styles.photo, { borderRadius: theme.radius.lg }]} />;
  }

  if (source.state === 'unavailable') {
    return (
      <View
        style={[
          styles.missing,
          { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.lg },
        ]}
      >
        <Text variant="caption" color="inkSecondary" align="center">
          This photo is not on this device.
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: source.uri }}
      style={[styles.photo, { borderRadius: theme.radius.lg }]}
      resizeMode="cover"
      accessibilityLabel="A photo from this entry"
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 3 / 4, overflow: 'hidden', width: '100%' },
  missing: { alignItems: 'center', justifyContent: 'center', minHeight: 120, padding: 24 },
  photo: { aspectRatio: 4 / 3, width: '100%' },
  playDot: { borderRadius: 5, height: 10, width: 10 },
  poster: { alignItems: 'center', height: 64, justifyContent: 'center', width: 64 },
  video: { height: '100%', width: '100%' },
});
