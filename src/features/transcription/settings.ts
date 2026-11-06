import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether recordings are transcribed.
 *
 * On by default: it happens on the phone, nothing is sent anywhere to do it,
 * and a transcript is what makes a video entry searchable and readable later.
 * She can still turn it off, and the words already transcribed stay.
 */

const KEY = 'transcription.v1';

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToTranscriptionSetting(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function transcriptionEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return true;
    return (JSON.parse(raw) as { enabled?: boolean }).enabled !== false;
  } catch {
    return true;
  }
}

export async function setTranscriptionEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ enabled }));
  for (const listener of [...listeners]) listener();
}

export async function clearTranscriptionSetting(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
  for (const listener of [...listeners]) listener();
}
