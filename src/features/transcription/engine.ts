import { requireOptionalNativeModule } from 'expo';
import { File } from 'expo-file-system';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionOptions,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

import { logger } from '@/services/logger';

import { AudioExtract } from '../../../modules/audio-extract';

/**
 * Turning a recording into words, on the phone.
 *
 * Apple's speech recognition, asked to run on the device only. The recording
 * is never sent anywhere to be transcribed — not to us, not to Apple — which
 * is the only arrangement that fits a diary somebody talks to on a bad night.
 * The words that come out are then treated like anything else she wrote.
 *
 * The native module is reached through `requireOptionalNativeModule` and never
 * by importing `expo-speech-recognition`: that package loads its module
 * eagerly and throws where it is missing, and it is missing from Expo Go. A
 * build made with `npx expo run:ios` has it; anywhere else this reports that
 * it is unavailable and the app carries on without it.
 */

interface Subscription {
  remove(): void;
}

interface SpeechModule {
  start(options: ExpoSpeechRecognitionOptions): void;
  abort(): void;
  isRecognitionAvailable(): boolean;
  supportsOnDeviceRecognition(): boolean;
  getSpeechRecognizerPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestSpeechRecognizerPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  addListener(
    event: 'result',
    listener: (event: ExpoSpeechRecognitionResultEvent) => void,
  ): Subscription;
  addListener(
    event: 'error',
    listener: (event: ExpoSpeechRecognitionErrorEvent) => void,
  ): Subscription;
  addListener(event: 'end', listener: () => void): Subscription;
}

const Speech = requireOptionalNativeModule<SpeechModule>('ExpoSpeechRecognition');

export type Availability =
  | { available: true }
  | { available: false; reason: 'needs-full-build' | 'not-on-device' | 'not-allowed' };

/** The language to listen for: the phone's own, or British English. */
export function listeningLanguage(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return /^[a-z]{2}(-[A-Z]{2})?$/.test(locale) ? locale : 'en-GB';
  } catch {
    return 'en-GB';
  }
}

/**
 * Whether this phone can transcribe at all, without asking for anything.
 *
 * On-device recognition is required, not preferred. A phone that would have
 * to send the audio to Apple's servers to understand it is reported as unable,
 * because "transcribed on your phone" is a promise the screens make.
 */
export function canTranscribeHere(): Availability {
  if (Speech === null || AudioExtract === null)
    return { available: false, reason: 'needs-full-build' };
  try {
    if (!Speech.isRecognitionAvailable() || !Speech.supportsOnDeviceRecognition()) {
      return { available: false, reason: 'not-on-device' };
    }
  } catch {
    return { available: false, reason: 'not-on-device' };
  }
  return { available: true };
}

/**
 * Permission to use speech recognition, asked for the first time it is needed.
 *
 * Only speech recognition: transcribing a file does not use the microphone,
 * so the microphone prompt is not shown here.
 */
export async function allowTranscription(): Promise<boolean> {
  if (Speech === null) return false;
  try {
    const current = await Speech.getSpeechRecognizerPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Speech.requestSpeechRecognizerPermissionsAsync()).granted;
  } catch (error) {
    logger.warn('Could not ask for speech recognition', { error });
    return false;
  }
}

/** Silence is an answer, not a failure: a clip with no words has none to give. */
const NOTHING_SAID = new Set(['no-speech', 'speech-timeout']);

/**
 * Transcribes one recording.
 *
 * Video goes through `AudioExtract` first, because the recogniser reads audio
 * files and the camera writes movies; the copy is deleted afterwards whatever
 * happens. Resolves with the words, or an empty string for a clip with none.
 *
 * The recogniser is one shared instance, so callers must not run two of these
 * at once — the runner queues them.
 */
export async function transcribe(uri: string, kind: 'video' | 'audio'): Promise<string> {
  if (Speech === null || AudioExtract === null)
    throw new Error('Transcription needs the full app build');

  const source = kind === 'video' ? await AudioExtract.extractAudioAsync(uri) : uri;

  try {
    return await listen(Speech, source);
  } finally {
    if (source !== uri) {
      try {
        new File(source).delete();
      } catch {
        // A temporary file the system will clear anyway.
      }
    }
  }
}

function listen(speech: SpeechModule, uri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const finals: string[] = [];
    let latest = '';

    const subscriptions: Subscription[] = [];
    const done = (outcome: () => void) => {
      for (const subscription of subscriptions) subscription.remove();
      outcome();
    };

    subscriptions.push(
      speech.addListener('result', (event) => {
        const text = event.results[0]?.transcript.trim() ?? '';
        if (event.isFinal) {
          if (text.length > 0) finals.push(text);
          latest = '';
        } else {
          latest = text;
        }
      }),
      speech.addListener('error', (event) => {
        if (NOTHING_SAID.has(event.error)) {
          done(() => resolve(join(finals, latest)));
          return;
        }
        done(() => reject(new Error(`${event.error}: ${event.message}`)));
      }),
      speech.addListener('end', () => {
        done(() => resolve(join(finals, latest)));
      }),
    );

    try {
      speech.start({
        lang: listeningLanguage(),
        requiresOnDeviceRecognition: true,
        continuous: true,
        interimResults: true,
        addsPunctuation: true,
        audioSource: { uri },
      });
    } catch (error) {
      done(() => reject(error instanceof Error ? error : new Error('Could not start')));
    }
  });
}

/**
 * The finished transcript.
 *
 * File recognition hands back one final result per stretch of speech; a last
 * stretch that ended with the file rather than with a pause may only ever
 * arrive as an interim one, and is kept rather than dropped.
 */
export function join(finals: string[], trailing: string): string {
  const parts = [...finals];
  if (trailing.length > 0 && parts.at(-1) !== trailing) parts.push(trailing);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
