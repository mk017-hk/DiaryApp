import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
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
import {
  createEntry,
  EmotionPicker,
  ThreadPicker,
  updateEntry,
  useSync,
  type EntryMedia,
} from '@/features/entries';
import {
  MAX_PHOTOS,
  persistPhoto,
  persistRecording,
  persistVoiceNote,
  pickPhotos,
  PhotoNote,
  VideoNote,
  VoiceNote,
  VoiceRecorder,
} from '@/features/media';
import { useProfile } from '@/features/profile';
import { longDate, toDateKey } from '@/lib/date';
import { logger } from '@/services/logger';

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
  const { shared } = useSync();

  const [recording, setRecording] = useState(mode === 'video');
  const [voiceOpen, setVoiceOpen] = useState(mode === 'voice');

  /**
   * Everything attached so far, in the order it was added.
   *
   * Still pointing at temporary files at this stage — they are moved somewhere
   * durable on save, because a capture the user then abandons should not leave
   * anything behind in the document directory.
   */
  const [media, setMedia] = useState<EntryMedia[]>([]);
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [emotions, setEmotions] = useState<string[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [aiExcluded, setAiExcluded] = useState(false);
  const [resurfaceExcluded, setResurfaceExcluded] = useState(false);
  const [isPersonal, setIsPersonal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Read once. A screen open past midnight must not silently change which day
  // the entry belongs to, and reading the clock during render is impure.
  const [openedAt] = useState(() => new Date());

  const photos = media.filter((item) => item.kind === 'photo');
  const video = media.find((item) => item.kind === 'video');
  const voice = media.find((item) => item.kind === 'audio');
  const hasSomething = body.trim().length > 0 || media.length > 0;

  const addPhotos = async () => {
    const picked = await pickPhotos(MAX_PHOTOS - photos.length);
    if (picked.length === 0) return;

    setMedia((current) => [
      ...current,
      ...picked.map((uri) => ({ id: Crypto.randomUUID(), kind: 'photo' as const, uri })),
    ]);
  };

  const save = async () => {
    if (!hasSomething) return;
    setSaving(true);
    const now = new Date();

    // The entry is written first, still pointing at the temporary files. If a
    // move then fails the entry still exists and still references something
    // playable — the worst case is a file the system may later reclaim, rather
    // than a moment lost outright.
    const entry = await createEntry({
      entryDate: toDateKey(now),
      entryAt: now.toISOString(),
      body: body.trim(),
      mood,
      emotions,
      media,
      ...(threadId !== undefined ? { threadId } : {}),
      ...(aiExcluded ? { aiExcluded: true } : {}),
      ...(resurfaceExcluded ? { resurfaceExcluded: true } : {}),
      ...(isPersonal ? { isPersonal: true } : {}),
      isFavourite: false,
    });

    const durable = await Promise.all(
      media.map(async (item): Promise<EntryMedia> => {
        if (item.uri === undefined) return item;

        try {
          if (item.kind === 'video') {
            const stored = await persistRecording(item.uri, item.id);
            return {
              ...item,
              uri: stored.uri,
              ...(stored.posterUri !== undefined ? { posterUri: stored.posterUri } : {}),
            };
          }

          if (item.kind === 'photo') {
            return { ...item, uri: persistPhoto(item.uri, item.id) };
          }

          return { ...item, uri: persistVoiceNote(item.uri, item.id) };
        } catch (error) {
          logger.error('Could not move a capture into permanent storage', { error });
          return item;
        }
      }),
    );

    await updateEntry(entry.id, { media: durable });
    router.back();
  };

  if (recording) {
    return (
      <VideoCapture
        onCancel={() => setRecording(false)}
        onCaptured={(uri) => {
          setMedia((current) => [
            ...current.filter((item) => item.kind !== 'video'),
            { id: Crypto.randomUUID(), kind: 'video', uri },
          ]);
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
              {longDate(openedAt)}
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

          {video !== undefined && (
            <View style={styles.videoNote}>
              <VideoNote item={video} />
              <PressableScale
                onPress={() => setMedia((c) => c.filter((item) => item.id !== video.id))}
                haptic="light"
                accessibilityLabel="Discard this recording"
                style={styles.discard}
              >
                <Text variant="caption" color="inkTertiary">
                  Record again
                </Text>
              </PressableScale>
            </View>
          )}

          {voice !== undefined && (
            <View style={styles.attachment}>
              <VoiceNote item={voice} />
              <PressableScale
                onPress={() => setMedia((c) => c.filter((item) => item.id !== voice.id))}
                haptic="light"
                accessibilityLabel="Discard this voice note"
                style={styles.discard}
              >
                <Text variant="caption" color="inkTertiary">
                  Record it again
                </Text>
              </PressableScale>
            </View>
          )}

          {voiceOpen && voice === undefined && (
            <View style={styles.attachment}>
              <VoiceRecorder
                onCancel={() => setVoiceOpen(false)}
                onRecorded={(uri, durationMs) => {
                  setMedia((current) => [
                    ...current,
                    { id: Crypto.randomUUID(), kind: 'audio', uri, durationMs },
                  ]);
                  setVoiceOpen(false);
                }}
              />
            </View>
          )}

          {photos.length > 0 && (
            <View style={styles.photos}>
              {photos.map((photo) => (
                <View key={photo.id} style={styles.photoWrap}>
                  <PhotoNote item={photo} />
                  <PressableScale
                    onPress={() => setMedia((c) => c.filter((item) => item.id !== photo.id))}
                    haptic="light"
                    accessibilityLabel="Remove this photo"
                    style={styles.discard}
                  >
                    <Text variant="caption" color="inkTertiary">
                      Remove
                    </Text>
                  </PressableScale>
                </View>
              ))}
            </View>
          )}

          {/* Serif, generous leading, no border. This is the page. */}
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={
              media.length > 0
                ? 'Anything you want to add in writing?'
                : `Start anywhere, ${name.length > 0 ? name : 'friend'}…`
            }
            placeholderTextColor={theme.colors.inkFaint}
            multiline
            autoFocus={media.length === 0}
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

          <EmotionPicker selected={emotions} onChange={setEmotions} />

          <ThreadPicker selected={threadId} onChange={setThreadId} />

          {/* Both offered at the moment it matters, in plain words. One
              difficult entry inside an otherwise ordinary week should be
              holdable back without having to mark the whole story private.
              Two separate options because they are two separate sentences:
              "never read this" and "never hand this back to me" are each
              reasonable without the other. */}
          <View style={styles.quietOptions}>
            <QuietOption
              label="Keep this one to yourself — never read, never asked about"
              accessibilityLabel="Keep this one to yourself"
              on={aiExcluded}
              onPress={() => setAiExcluded(!aiExcluded)}
            />
            <QuietOption
              label="Never bring this one back to me"
              accessibilityLabel="Never bring this one back to me"
              on={resurfaceExcluded}
              onPress={() => setResurfaceExcluded(!resurfaceExcluded)}
            />
            {/* Only in a diary somebody else is in. In a diary of one it would
                be a question with no meaning, offered on every page. */}
            {shared && (
              <QuietOption
                label="Just for me — not shown to anyone else in this diary"
                accessibilityLabel="Keep this page to yourself"
                on={isPersonal}
                onPress={() => setIsPersonal(!isPersonal)}
              />
            )}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          {/* The four formats the concept promised, as one quiet row rather
              than four buttons competing with what you are writing. Each one
              disappears once it has been used. */}
          <View style={styles.attachRow}>
            {video === undefined && (
              <AttachLink label="Record" onPress={() => setRecording(true)} />
            )}
            {voice === undefined && !voiceOpen && (
              <AttachLink label="Say it" onPress={() => setVoiceOpen(true)} />
            )}
            {photos.length < MAX_PHOTOS && (
              <AttachLink label="Add a photo" onPress={() => void addPhotos()} />
            )}
          </View>

          <Button
            label="Keep this"
            onPress={() => void save()}
            loading={saving}
            disabled={!hasSomething}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </DiaryPage>
  );
}

/** One of the two things you can ask the app not to do with an entry. */
function QuietOption({
  label,
  accessibilityLabel,
  on,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  on: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on }}
      style={[
        styles.exclude,
        {
          backgroundColor: on ? theme.colors.accentWash : 'transparent',
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <Text variant="caption" color={on ? 'accent' : 'inkTertiary'}>
        {on ? '✓ ' : ''}
        {label}
      </Text>
    </PressableScale>
  );
}

/** One of the ways to attach something. Deliberately a link, not a button. */
function AttachLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} haptic="light" accessibilityLabel={label}>
      <Text variant="label" color="accent">
        {label}
      </Text>
    </PressableScale>
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
  attachRow: { flexDirection: 'row', gap: space.lg, paddingVertical: space.xs },
  attachment: { gap: space.xs, marginTop: space.md },
  close: { padding: space.xxs },
  photoWrap: { gap: space.xxs },
  photos: { gap: space.sm, marginTop: space.md },
  quietOptions: { gap: space.xxs, marginTop: space.lg },
  exclude: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
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
  discard: { alignSelf: 'center', paddingVertical: space.xs },
  videoNote: { gap: space.xs, marginTop: space.md },
  writing: {
    fontSize: 19,
    lineHeight: 32,
    marginTop: space.lg,
    minHeight: 240,
    padding: 0,
  },
});
