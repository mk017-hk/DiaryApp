import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, DiaryPage, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import { createEntry } from '@/features/entries/entryStore';
import { useProfile } from '@/features/profile';
import { longDate, toDateKey } from '@/lib/date';

const MOODS = [
  { value: 1, label: 'Heavy' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Even' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Bright' },
];

/**
 * Writing an entry.
 *
 * The page is the point. Date at the top in the assistant's hand, then your
 * own words in serif on paper, with the margin rule beside them. No card, no
 * boxed input, no visible form — you are writing in a book, and the interface
 * should get out of the way of that.
 */
export default function Compose() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { name } = useProfile();
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  const [recording, setRecording] = useState(mode === 'video');
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (body.trim().length === 0 && videoUri === null) return;
    setSaving(true);
    const now = new Date();
    await createEntry({
      entryDate: toDateKey(now),
      entryAt: now.toISOString(),
      body: body.trim(),
      mood,
      emotions: [],
      ...(videoUri !== null ? { videoUri } : {}),
      isFavourite: false,
    });
    router.back();
  };

  if (recording) {
    return (
      <VideoCapture
        onCancel={() => setRecording(false)}
        onCaptured={(uri) => {
          setVideoUri(uri);
          setRecording(false);
        }}
      />
    );
  }

  return (
    <DiaryPage>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text variant="caption" color="inkTertiary">
              {longDate(new Date())}
            </Text>
            <PressableScale
              onPress={() => router.back()}
              haptic="light"
              accessibilityLabel="Close"
              style={styles.close}
            >
              <Text variant="callout" color="inkTertiary">
                Close
              </Text>
            </PressableScale>
          </View>

          {videoUri !== null && (
            <View
              style={[
                styles.videoNote,
                { backgroundColor: theme.colors.accentWash, borderRadius: theme.radius.md },
              ]}
            >
              <Text variant="caption" color="inkSecondary">
                Video recorded · it will be transcribed here once that ships
              </Text>
            </View>
          )}

          {/* Serif, generous leading, no border. This is the page. */}
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={
              videoUri !== null
                ? 'Anything you want to add in writing?'
                : `Start anywhere, ${name.length > 0 ? name : 'friend'}…`
            }
            placeholderTextColor={theme.colors.inkFaint}
            multiline
            autoFocus={videoUri === null}
            textAlignVertical="top"
            style={[
              styles.writing,
              {
                color: theme.colors.ink,
                fontFamily: theme.fontFamily.serifRegular,
              },
            ]}
            accessibilityLabel="Your entry"
          />

          <View style={styles.moodRow}>
            <Text variant="overline" color="inkTertiary">
              How was it?
            </Text>
            <View style={styles.chips}>
              {MOODS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={mood === option.value}
                  onPress={() => setMood(mood === option.value ? null : option.value)}
                />
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          {videoUri === null && (
            <Button
              label="Record instead"
              onPress={() => setRecording(true)}
              variant="ghost"
              size="small"
            />
          )}
          <Button
            label="Keep this"
            onPress={() => void save()}
            loading={saving}
            disabled={body.trim().length === 0 && videoUri === null}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </DiaryPage>
  );
}

/** Full-bleed camera. Recording a diary entry should feel like talking to
 *  someone, so the frame is the whole screen and the chrome is minimal. */
function VideoCapture({
  onCancel,
  onCaptured,
}: {
  onCancel: () => void;
  onCaptured: (uri: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isRecording, setIsRecording] = useState(false);

  const granted = cameraPermission?.granted === true && micPermission?.granted === true;

  if (!granted) {
    return (
      <DiaryPage>
        <View style={[styles.permission, { paddingTop: insets.top }]}>
          <Text variant="title2" align="center">
            To record, the app needs your camera and microphone
          </Text>
          <Text variant="callout" color="inkSecondary" align="center">
            Nothing is recorded until you press the button, and nothing leaves your phone without
            you choosing to save it.
          </Text>
          <Button
            label="Allow"
            onPress={() => {
              void requestCamera();
              void requestMic();
            }}
            fullWidth
          />
          <Button label="Not now" onPress={onCancel} variant="ghost" />
        </View>
      </DiaryPage>
    );
  }

  const toggle = async () => {
    if (cameraRef.current === null) return;

    if (isRecording) {
      cameraRef.current.stopRecording();
      return;
    }

    setIsRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 300 });
      if (video?.uri !== undefined) onCaptured(video.uri);
    } finally {
      setIsRecording(false);
    }
  };

  return (
    <View style={styles.camera}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" mode="video" />

      <View style={[styles.cameraTop, { paddingTop: insets.top + space.sm }]}>
        <PressableScale onPress={onCancel} haptic="light" accessibilityLabel="Cancel recording">
          <Text variant="label" style={styles.onCamera}>
            Cancel
          </Text>
        </PressableScale>
      </View>

      <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + space.xl }]}>
        <PressableScale
          onPress={() => void toggle()}
          haptic="medium"
          ensureTouchTarget={false}
          accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
          style={styles.shutterRing}
        >
          <View style={isRecording ? styles.shutterStop : styles.shutterIdle} />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  camera: { backgroundColor: '#000', flex: 1 },
  cameraBottom: { alignItems: 'center', bottom: 0, left: 0, position: 'absolute', right: 0 },
  cameraTop: { left: space.lg, position: 'absolute', top: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  close: { padding: space.xxs },
  content: { paddingBottom: space.xxl, paddingRight: space.lg },
  fill: { flex: 1 },
  footer: { gap: space.xs, paddingHorizontal: space.lg, paddingRight: space.lg },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  moodRow: { gap: space.xs, marginTop: space.xl },
  onCamera: { color: '#FFFFFF' },
  permission: { flex: 1, gap: space.md, justifyContent: 'center', paddingHorizontal: space.lg },
  shutterIdle: { backgroundColor: '#FFFFFF', borderRadius: 30, height: 60, width: 60 },
  shutterRing: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 40,
    borderWidth: 3,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  shutterStop: { backgroundColor: '#E5544B', borderRadius: 6, height: 30, width: 30 },
  videoNote: { marginTop: space.md, padding: space.sm },
  writing: {
    fontSize: 19,
    lineHeight: 32,
    marginTop: space.lg,
    minHeight: 240,
    padding: 0,
  },
});
