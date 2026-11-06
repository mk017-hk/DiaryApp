import { clearCycleSettings, clearDayLogs } from '@/features/cycle';
import { clearEntries, clearQuietDates, clearThreads } from '@/features/entries';
import { resetSyncState } from '@/features/entries/sync';
import { clearArchive } from '@/features/export';
// By file, not through the feature's index: that also exports the scheduler
// component, and the wipe has no business loading the router.
import { clearReminderSettings } from '@/features/reminders/reminderSettings';
import { cancelAllReminders } from '@/features/reminders/scheduler';
import { clearLetters } from '@/features/letters';
import { deleteAllCaptured, deleteAllRecordings } from '@/features/media';
import { logger } from '@/services/logger';
import { forgetSignedUrls } from '@/services/supabase/media';

import { forgetOwner } from './owner';

/**
 * Emptying this phone of one person's diary.
 *
 * One list, used by every path that needs it: signing out, deleting an account,
 * and a different account signing in. It used to live inline on the account
 * screen, which is how the exported copy of the diary came to be left behind on
 * sign-out — a store added later, and a list in one place that nobody went back
 * to.
 *
 * So the storage keys are classified here too, and a test reads every key the
 * app declares and fails if one is in neither list. A future feature that adds
 * a store has to decide which side of this line it is on.
 */

/** Keys holding one person's diary. All of them go. */
export const ACCOUNT_KEYS = [
  'entries.v1',
  'entries.watermark.v1',
  'threads.v1',
  'resurfacingMutes.v1',
  'letters.v1',
  'profile.v1',
  // Cycle data is the most sensitive thing on the phone after the diary
  // itself, and it is one person's. It goes with the account.
  'cycle.days.v1',
  'cycle.settings.v1',
  'reminders.v1',
] as const;

/**
 * Keys that belong to the phone rather than to whoever is signed in.
 *
 * The app lock guards the device — "may this person open the app" — which is a
 * different question from "whose account is this", and the two are kept apart
 * on purpose in the root layout. Wiping the PIN because the account changed
 * would hand an unlocked phone to whoever caused the change.
 */
export const DEVICE_KEYS = [
  'lock.pin.hash',
  'lock.pin.salt',
  'lock.attempts',
  'lock.timeout',
  'lock.biometrics',
  'device.owner.v1',
  // How the app looks on this phone. Not anybody's diary.
  'theme.preference.v1',
] as const;

export interface WipeOutcome {
  /** False if any store that would show or upload the diary failed to clear. */
  complete: boolean;
}

/**
 * Removes every trace of the diary from this device.
 *
 * The profile is passed in rather than cleared here: it is held in a provider's
 * state as well as in storage, and clearing only the storage would leave the
 * old name on screen until the next launch. Going through the provider keeps
 * the two in step.
 *
 * Every step is attempted even if an earlier one fails. Stopping at the first
 * failure would leave more of the diary behind, not less.
 */
export async function wipeDiaryFromDevice(options: {
  resetProfile: () => Promise<void>;
}): Promise<WipeOutcome> {
  // In-memory, so synchronous and first: a signed URL outlives the session it
  // was minted for until it expires.
  forgetSignedUrls();

  const results = await Promise.allSettled([
    clearEntries(),
    clearThreads(),
    clearQuietDates(),
    clearLetters(),
    clearDayLogs(),
    clearCycleSettings(),
    clearReminderSettings(),
    // Scheduled on the OS, not in storage: "your period may start tomorrow"
    // arriving on a phone that now belongs to someone else would be the same
    // leak as showing them the diary.
    cancelAllReminders(),
    resetSyncState(),
    options.resetProfile(),
    deleteAllRecordings(),
    forgetOwner(),
  ]);

  // These two catch their own failures; there is nothing to settle.
  deleteAllCaptured();
  clearArchive();

  const failed = results.filter((result) => result.status === 'rejected');
  for (const failure of failed) {
    logger.error('Part of the device wipe failed', {
      error: (failure as PromiseRejectedResult).reason,
    });
  }

  return { complete: failed.length === 0 };
}
