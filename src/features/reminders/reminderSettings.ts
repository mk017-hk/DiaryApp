import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '@/services/logger';

/**
 * Which reminders she wants, and when.
 *
 * Every one is off until she turns it on. A diary that starts sending
 * notifications the day it is installed is a diary that gets its
 * notifications turned off in Settings, and the useful ones with them.
 */

const KEY = 'reminders.v1';

export interface TimeOfDay {
  hour: number;
  minute: number;
}

export interface ReminderSettings {
  /**
   * Notifications say nothing specific.
   *
   * On by default. A lock screen is the least private surface a phone has, and
   * "Your period may start tomorrow" is not a sentence everyone wants lying
   * face-up on a desk. Discreet reminders say only that there is something to
   * look at.
   */
  discreet: boolean;
  checkIn: { enabled: boolean } & TimeOfDay;
  period: { enabled: boolean; daysBefore: number } & TimeOfDay;
  fertile: { enabled: boolean } & TimeOfDay;
  pill: { enabled: boolean } & TimeOfDay;
  letters: { enabled: boolean };
  memories: { enabled: boolean };
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  discreet: true,
  checkIn: { enabled: false, hour: 20, minute: 30 },
  period: { enabled: false, daysBefore: 2, hour: 9, minute: 0 },
  fertile: { enabled: false, hour: 9, minute: 0 },
  pill: { enabled: false, hour: 9, minute: 0 },
  letters: { enabled: false },
  memories: { enabled: false },
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToReminderSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadReminderSettings(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return DEFAULT_REMINDERS;
    const stored = JSON.parse(raw) as Partial<ReminderSettings>;
    // Field by field, so a setting added later gets its default rather than
    // undefined on a phone that saved its reminders before it existed.
    return {
      discreet: stored.discreet ?? DEFAULT_REMINDERS.discreet,
      checkIn: { ...DEFAULT_REMINDERS.checkIn, ...stored.checkIn },
      period: { ...DEFAULT_REMINDERS.period, ...stored.period },
      fertile: { ...DEFAULT_REMINDERS.fertile, ...stored.fertile },
      pill: { ...DEFAULT_REMINDERS.pill, ...stored.pill },
      letters: { ...DEFAULT_REMINDERS.letters, ...stored.letters },
      memories: { ...DEFAULT_REMINDERS.memories, ...stored.memories },
    };
  } catch (error) {
    logger.error('Could not read reminder settings', { error });
    return DEFAULT_REMINDERS;
  }
}

export async function saveReminderSettings(next: ReminderSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  for (const listener of [...listeners]) listener();
}

export async function clearReminderSettings(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
  for (const listener of [...listeners]) listener();
}

export function anyEnabled(settings: ReminderSettings): boolean {
  return (
    settings.checkIn.enabled ||
    settings.period.enabled ||
    settings.fertile.enabled ||
    settings.pill.enabled ||
    settings.letters.enabled ||
    settings.memories.enabled
  );
}
