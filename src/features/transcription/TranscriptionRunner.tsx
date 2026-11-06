import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { recordingsToTranscribe, setMediaTranscript, subscribeToEntries } from '@/features/entries';
import { toDateKey } from '@/lib/date';
import { logger } from '@/services/logger';

import { allowTranscription, canTranscribeHere, transcribe } from './engine';
import { subscribeToTranscriptionSetting, transcriptionEnabled } from './settings';

/** How far back the runner looks on its own. Older recordings wait to be asked. */
const BACKLOG_DAYS = 30;

/**
 * Transcribes recordings in the background, one at a time.
 *
 * Renders nothing. Mounted inside the lock gate with the other runners, and
 * woken by any change to entries — a new video saved, or "Transcribe" tapped
 * on an old one — and by the app coming back to the foreground.
 *
 * Does nothing at all where transcription is not possible (Expo Go, the web, a
 * phone without on-device recognition for its language), and leaves those
 * recordings untouched rather than marking them failed, so a build that can
 * transcribe them later still will.
 */
export function TranscriptionRunner() {
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (!canTranscribeHere().available) return;

    let running = false;
    let again = false;
    let stopped = false;

    const run = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          if (!(await transcriptionEnabled())) break;

          const since = toDateKey(new Date(Date.now() - BACKLOG_DAYS * 24 * 60 * 60 * 1000));
          const queue = await recordingsToTranscribe(since);
          if (queue.length === 0) break;
          if (!(await allowTranscription())) break;

          // One per pass; the write it makes wakes the next.
          const next = queue[0];
          if (next === undefined || next.item.uri === undefined || stopped) break;

          try {
            const words = await transcribe(
              next.item.uri,
              next.item.kind === 'video' ? 'video' : 'audio',
            );
            await setMediaTranscript(next.entryId, next.item.id, {
              status: 'done',
              transcript: words,
            });
          } catch (error) {
            logger.warn('A recording could not be transcribed', { error });
            await setMediaTranscript(next.entryId, next.item.id, { status: 'failed' });
          }
        } while (again && !stopped);
      } finally {
        running = false;
      }
    };

    const wake = () => void run();
    wake();
    const unsubscribers = [subscribeToEntries(wake), subscribeToTranscriptionSetting(wake)];
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') wake();
    });

    return () => {
      stopped = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
      appState.remove();
    };
  }, []);

  return null;
}
