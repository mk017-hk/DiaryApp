import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import type { EntryMedia } from '@/features/entries/entryStore';

import { useMediaSource } from './useMediaSource';

/**
 * Listening to a voice note back.
 *
 * Paused until you press it, like the video. Something recorded on a bad
 * night should not start talking the moment you open the day it belongs to.
 *
 * Deliberately plain — a play control, a position, and nothing else. A
 * waveform would be decoration on a thing nobody scrubs through.
 */
export function VoiceNote({ item }: { item: EntryMedia }) {
  const theme = useTheme();
  const source = useMediaSource(item.uri, item.remotePath);

  const player = useAudioPlayer(source.state === 'ready' ? source.uri : null);
  const status = useAudioPlayerStatus(player);

  if (source.state === 'unavailable') {
    return (
      <View
        style={[
          styles.row,
          { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.lg },
        ]}
      >
        <Text variant="caption" color="inkSecondary">
          This recording is not on this device.
        </Text>
      </View>
    );
  }

  const ready = source.state === 'ready';
  const playing = status.playing;

  return (
    <PressableScale
      onPress={() => (playing ? player.pause() : player.play())}
      haptic="light"
      disabled={!ready}
      accessibilityLabel={playing ? 'Pause this recording' : 'Play this recording'}
      style={[
        styles.row,
        { backgroundColor: theme.colors.accentWash, borderRadius: theme.radius.lg },
      ]}
    >
      <View
        style={[
          styles.control,
          { backgroundColor: theme.colors.accent, borderRadius: theme.radius.full },
        ]}
      >
        <Text variant="label" color="onAccent">
          {playing ? '❙❙' : '▶'}
        </Text>
      </View>

      <Text variant="callout" color="inkSecondary">
        {ready ? describe(status.currentTime, status.duration, item.durationMs) : 'Fetching…'}
      </Text>
    </PressableScale>
  );
}

/**
 * How far through, and how long.
 *
 * Falls back to the duration recorded at capture when the player has not
 * loaded yet, so the row does not sit at 0:00 while a signed URL is fetched.
 */
function describe(currentTime: number, duration: number, recordedMs: number | undefined): string {
  const total = duration > 0 ? duration : (recordedMs ?? 0) / 1000;
  if (total <= 0) return 'Voice note';

  return currentTime > 0 ? `${clock(currentTime)} / ${clock(total)}` : clock(total);
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `${String(minutes)}:${String(whole % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  control: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    padding: space.sm,
  },
});
