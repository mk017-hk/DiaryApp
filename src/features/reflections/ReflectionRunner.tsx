import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/features/auth';
import { getEntry, subscribeToEntries } from '@/features/entries';
import { canTranscribeHere } from '@/features/transcription';
import { logger } from '@/services/logger';
import { isTransient, requestReflection } from '@/services/supabase/reflections';

import {
  finishReflection,
  markSupportNeeded,
  pendingReflections,
  readiness,
  retryLater,
  subscribeToReflections,
} from './queue';

/**
 * Asks for notes on entries once they are ready, one at a time.
 *
 * Renders nothing. Only runs while signed in — the function reads entries from
 * the account — and only inside the lock gate. Woken by entry changes (a sync
 * landing, a transcript arriving), by an entry joining the queue, and by the
 * app coming back to the foreground.
 *
 * Each entry gets at most one request per wake. Without that, being offline
 * would spend every retry in the same second, since recording a failed try is
 * itself a change that wakes the runner.
 */
export function ReflectionRunner() {
  const { status } = useSession();
  const signedIn = status === 'signed-in';

  useEffect(() => {
    if (!signedIn) return;

    let running = false;
    let again = false;
    let stopped = false;
    let tried = new Set<string>();
    const transcribing = canTranscribeHere().available;

    const pass = async (): Promise<void> => {
      for (const item of await pendingReflections()) {
        if (stopped) return;
        if (tried.has(item.entryId)) continue;

        const state = readiness(await getEntry(item.entryId), transcribing);
        if (state === 'waiting') continue;
        tried.add(item.entryId);

        if (state !== 'ready') {
          await finishReflection(item.entryId);
          continue;
        }

        const outcome = await requestReflection(item.entryId);
        if (outcome.kind === 'unavailable' && isTransient(outcome.reason)) {
          await retryLater(item.entryId);
        } else {
          if (outcome.kind === 'support') markSupportNeeded();
          await finishReflection(item.entryId);
        }
      }
    };

    const run = async (fresh: boolean) => {
      if (fresh) tried = new Set();
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          await pass();
        } while (again && !stopped);
      } catch (error) {
        logger.warn('Could not ask for reflections', { error });
      } finally {
        running = false;
      }
    };

    // Outside wakes start a fresh round of tries; the queue's own changes,
    // which this runner mostly causes, do not.
    void run(true);
    const unsubscribers = [
      subscribeToEntries(() => void run(true)),
      subscribeToReflections(() => void run(false)),
    ];
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run(true);
    });

    return () => {
      stopped = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
      appState.remove();
    };
  }, [signedIn]);

  return null;
}
