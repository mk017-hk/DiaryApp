import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import { logger } from '@/services/logger';

interface VoiceRecorderProps {
  onRecorded: (uri: string, durationMs: number) => void;
  onCancel: () => void;
}

/** Long enough for anything worth saying, short enough not to be a podcast. */
const MAX_SECONDS = 600;

/**
 * Recording a voice note.
 *
 * The quieter half of talking to the camera: the train, the dark, the morning
 * you do not want to look at yourself. Same idea as the video capture and
 * deliberately less ceremony — one control, a timer, and a way out.
 */
export function VoiceRecorder({ onRecorded, onCancel }: VoiceRecorderProps) {
  const theme = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setDenied(true);
        return;
      }

      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_SECONDS });
    } catch (error) {
      logger.error('Could not start recording', { error });
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      // Read the length before stopping: `stop` tears the session down, and
      // the duration is gone with it.
      const seconds = state.durationMillis / 1000;
      await recorder.stop();

      const uri = recorder.uri;
      if (uri !== null) onRecorded(uri, Math.round(seconds * 1000));
      else logger.warn('Recording stopped with no file');
    } catch (error) {
      logger.error('Could not stop recording', { error });
    } finally {
      setBusy(false);
    }
  };

  if (denied) {
    return (
      <View style={styles.wrap}>
        <Text variant="caption" color="inkTertiary">
          The microphone is off for this app. You can turn it on in Settings, or just write instead.
        </Text>
        <PressableScale onPress={onCancel} haptic="light" accessibilityLabel="Close">
          <Text variant="label" color="accent">
            Close
          </Text>
        </PressableScale>
      </View>
    );
  }

  const recording = state.isRecording;

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: theme.colors.accentWash, borderRadius: theme.radius.lg },
      ]}
    >
      <View style={styles.row}>
        <PressableScale
          onPress={() => void (recording ? stop() : start())}
          haptic="medium"
          disabled={busy}
          accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
          style={[
            styles.control,
            {
              backgroundColor: recording ? theme.colors.danger : theme.colors.accent,
              borderRadius: theme.radius.full,
            },
          ]}
        >
          <Text variant="label" color="onAccent">
            {recording ? '■' : '●'}
          </Text>
        </PressableScale>

        <Text variant="callout" color="inkSecondary">
          {recording ? clock(state.durationMillis / 1000) : 'Say it out loud'}
        </Text>
      </View>

      {!recording && (
        <PressableScale onPress={onCancel} haptic="light" accessibilityLabel="Not now">
          <Text variant="caption" color="inkTertiary">
            Not now
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${String(minutes)}:${String(whole % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  control: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  row: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  wrap: { gap: space.sm, padding: space.sm },
});
