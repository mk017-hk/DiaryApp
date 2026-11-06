import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { useCycle } from '@/features/cycle';
import { onThisDay, subscribeToEntries, subscribeToMutes } from '@/features/entries';
import { listLetters, subscribeToLetters } from '@/features/letters';
import { addDays, daysBetween, fromDateKey } from '@/lib/date';
import { logger } from '@/services/logger';

import { planReminders } from './plan';
import { anyEnabled, loadReminderSettings, subscribeToReminderSettings } from './reminderSettings';
import { applyPlan, cancelAllReminders, configureForeground, urlOf } from './scheduler';

/**
 * The reminder already acted on.
 *
 * The OS keeps handing back the response that launched the app for as long as
 * the process lives, and this component remounts whenever the lock gate does.
 * Without this, unlocking the app hours later would jump to that screen again.
 */
let lastHandled: string | null = null;

function once(response: Notifications.NotificationResponse | null): string | null {
  if (response === null) return null;
  const key = `${response.notification.request.identifier}@${String(response.notification.date)}`;
  if (key === lastHandled) return null;
  lastHandled = key;
  return urlOf(response);
}

/** How far ahead memories are looked for. */
const MEMORY_HORIZON = 14;

/**
 * Keeps what is scheduled in step with everything it depends on.
 *
 * Renders nothing. Mounted inside the lock gate, so it only runs while the
 * diary is open to its owner, and re-plans whenever an input moves: a period
 * logged, a letter sealed or opened, a quiet date added, the settings changed,
 * or the app coming back to the foreground on a new day. Changes arriving in a
 * burst — a sync landing, several taps on the log — are coalesced into one
 * re-plan.
 *
 * Also opens the screen a tapped reminder points at.
 */
export function ReminderScheduler() {
  const router = useRouter();
  const { settings: cycleSettings, now: cycleNow, summary, today } = useCycle();

  // The latest cycle figures, read when a re-plan runs rather than captured
  // when the subscriptions were made.
  const cycle = useRef({ cycleSettings, cycleNow, averageCycle: summary.averageCycle, today });
  useEffect(() => {
    cycle.current = { cycleSettings, cycleNow, averageCycle: summary.averageCycle, today };
  });

  const replanSoon = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    configureForeground();

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const replan = async () => {
      const settings = await loadReminderSettings();
      if (!anyEnabled(settings)) {
        await cancelAllReminders();
        return;
      }

      const { cycleSettings: cs, cycleNow: cn, averageCycle, today: key } = cycle.current;

      const letters = settings.letters.enabled ? await listLetters() : [];
      const memoryDays: string[] = [];
      if (settings.memories.enabled) {
        for (let offset = 0; offset <= MEMORY_HORIZON; offset += 1) {
          const day = addDays(key, offset);
          if ((await onThisDay(fromDateKey(day))).length > 0) memoryDays.push(day);
        }
      }

      // The next fertile window still ahead: this cycle's, or the next one's.
      let nextFertile: string | null = cn.fertile?.start ?? null;
      if (nextFertile !== null && daysBetween(key, nextFertile) < 0 && cn.nextPeriod !== null) {
        nextFertile = addDays(cn.nextPeriod, averageCycle - 14 - 5);
      }

      if (cancelled) return;
      await applyPlan(
        planReminders(settings, {
          now: new Date(),
          nextPeriod: cs.enabled ? cn.nextPeriod : null,
          nextFertile: cs.enabled ? nextFertile : null,
          letterDays: letters
            .filter((letter) => letter.unlockedAt === undefined)
            .map((letter) => letter.unlockOn),
          memoryDays,
          cycleTracking: cs.enabled,
          onPill: cs.onPill,
        }),
      );
    };

    const soon = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        void replan().catch((error: unknown) => logger.warn('Could not plan reminders', { error }));
      }, 800);
    };
    replanSoon.current = soon;

    soon();
    const unsubscribers = [
      subscribeToReminderSettings(soon),
      subscribeToLetters(soon),
      subscribeToEntries(soon),
      subscribeToMutes(soon),
    ];
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') soon();
    });

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      replanSoon.current = () => undefined;
      for (const unsubscribe of unsubscribers) unsubscribe();
      appState.remove();
    };
  }, []);

  // A period logged moves the period reminder; switching tracking off removes it.
  const predicted = cycleNow.nextPeriod;
  useEffect(() => {
    replanSoon.current();
  }, [predicted, cycleSettings.enabled, cycleSettings.onPill]);

  // Tapping a reminder opens what it was about — including the one that
  // launched the app, which arrives before this listener could have.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const url = once(response);
      if (url !== null) router.push(url as never);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = once(response);
      if (url !== null) router.push(url as never);
    });
    return () => subscription.remove();
  }, [router]);

  return null;
}
