import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/features/auth';
import { deleteRecording } from '@/features/media';
import { logger } from '@/services/logger';
import { AppError } from '@/services/supabase/errors';
import {
  personalDiaryId,
  pullEntries,
  pushEntries,
  type SyncContext,
} from '@/services/supabase/entries';
import {
  forgetSignedUrls,
  reconcilePendingMedia,
  uploadRecording,
} from '@/services/supabase/media';

import { allEntries, subscribeToEntries, unsyncedEntries } from './entryStore';
import { resetSyncState, syncEntries, type SyncRemote, type SyncReport } from './sync';

/**
 * Keeps the device and the account in step.
 *
 * Runs a pass when someone signs in, when the app comes to the front, and a
 * moment after anything is written. Nothing in the app waits on it: entries
 * are saved and shown from the device either way, and this is what eventually
 * carries them to the other phone.
 *
 * Failures are not surfaced. Being offline is the normal condition of a phone,
 * and a diary that puts a red banner on the screen every time a tunnel
 * interrupts a background request would be exhausting to keep. The queue
 * simply stays queued.
 */

export type SyncState = 'idle' | 'syncing' | 'offline';

interface SyncContextValue {
  state: SyncState;
  /** How many entries are waiting to reach the account. */
  pending: number;
  /** Runs a pass now. Returns what happened, for a pull-to-refresh. */
  syncNow: () => Promise<SyncReport | null>;
}

const SyncStateContext = createContext<SyncContextValue | null>(null);

/** A quiet moment after a write, so a burst of edits makes one push. */
const WRITE_DEBOUNCE_MS = 1500;

function remoteFor(context: SyncContext): SyncRemote {
  return {
    push: (entries) => pushEntries(entries, context),
    pull: (since) => pullEntries(since, context),
    uploadMedia: (entry) =>
      entry.videoUri === undefined
        ? Promise.resolve({
            ok: false as const,
            error: new AppError('not_found', 'That recording is no longer on this device.'),
          })
        : uploadRecording(entry.id, entry.videoUri, entry.posterUri, context),
  };
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const [state, setState] = useState<SyncState>('idle');
  const [pending, setPending] = useState(0);

  /**
   * The diary, remembered alongside whose it is.
   *
   * Stored as a pair so signing out needs no state change to invalidate it —
   * the user id simply stops matching and the diary is derived as absent. A
   * version of this that cleared the id in an effect would be one render of
   * one person's diary id while another person is signed in.
   */
  const [resolved, setResolved] = useState<{ userId: string; diaryId: string } | null>(null);

  // Held in a ref as well as state so the AppState and write listeners — which
  // are registered once and must not be torn down on every session change —
  // can read the current one without being rebuilt around it.
  const contextRef = useRef<SyncContext | null>(null);
  const userId = user?.id ?? null;

  const diaryId = resolved !== null && resolved.userId === userId ? resolved.diaryId : null;

  useEffect(() => {
    contextRef.current = diaryId !== null && userId !== null ? { diaryId, userId } : null;
  }, [diaryId, userId]);

  // --- which diary ---------------------------------------------------------

  useEffect(() => {
    if (status !== 'signed-in' || userId === null) return;

    let cancelled = false;
    void personalDiaryId().then((id) => {
      if (!cancelled && id !== null) setResolved({ userId, diaryId: id });
    });

    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  // --- signing out ---------------------------------------------------------

  useEffect(() => {
    if (status !== 'signed-out') return;

    // The next person to sign in on this phone must not inherit a watermark
    // from someone else's diary, or their first pull would skip everything
    // written before it. Signed URLs go too: they stay valid until they
    // expire, and one left in a live process outlives the session it came
    // from.
    forgetSignedUrls();
    void resetSyncState();
  }, [status]);

  // --- the pass itself -----------------------------------------------------

  const syncNow = useCallback(async (): Promise<SyncReport | null> => {
    const context = contextRef.current;
    if (context === null) return null;

    setState('syncing');
    const report = await syncEntries(remoteFor(context), {
      onRemoved: async (ids) => {
        // Recorded video does not cascade from anything; if the entry is
        // going, the file has to go with it or it sits on the phone forever
        // with nothing pointing at it.
        await Promise.all(ids.map((id) => deleteRecording(id)));
      },
    });

    if (report.status === 'failed') {
      logger.warn('Sync did not complete', { reason: report.error?.kind });
    }

    setState(report.status === 'failed' ? 'offline' : 'idle');
    return report;
  }, []);

  // --- when to run it ------------------------------------------------------

  // On sign-in, and once the diary is known.
  useEffect(() => {
    if (diaryId === null) return;

    void (async () => {
      await syncNow();

      // Then tidy up after any upload that died mid-flight — a recording made
      // and then backgrounded, or a battery that gave out. Once per session
      // rather than every pass: it is a scan, and nothing about it is urgent.
      const context = contextRef.current;
      if (context === null) return;

      const onDevice = new Map(
        (await allEntries()).map((entry) => [entry.id, entry.videoUri] as const),
      );

      await reconcilePendingMedia(context, (entryId) => onDevice.get(entryId));
    })();
  }, [diaryId, syncNow]);

  // On coming back to the front. A phone that has been in a pocket all day is
  // the ordinary case for having missed things.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && contextRef.current !== null) void syncNow();
    });

    return () => {
      subscription.remove();
    };
  }, [syncNow]);

  // Shortly after a write. Debounced, so finishing a sentence does not send
  // one request per keystroke.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = subscribeToEntries(() => {
      if (contextRef.current === null) return;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => void syncNow(), WRITE_DEBOUNCE_MS);
    });

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      unsubscribe();
    };
  }, [syncNow]);

  // --- how much is waiting -------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const count = () => {
      void unsyncedEntries().then((queued) => {
        if (!cancelled) setPending(queued.length);
      });
    };

    count();
    const unsubscribe = subscribeToEntries(count);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo<SyncContextValue>(
    () => ({ state, pending, syncNow }),
    [state, pending, syncNow],
  );

  return <SyncStateContext.Provider value={value}>{children}</SyncStateContext.Provider>;
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncStateContext);
  if (context === null) throw new Error('useSync must be used inside a <SyncProvider>');
  return context;
}
