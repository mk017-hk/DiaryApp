import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logger } from '@/services/logger';

import type { PlannedReminder } from './plan';

/**
 * Putting the plan onto the phone.
 *
 * Everything scheduled is replaced every time: cancel all, schedule the plan.
 * Diffing against what the OS already holds would save a few calls and buy a
 * class of bug where a reminder for a period that has since been logged, or a
 * letter that has since been opened, is left behind. The app schedules nothing
 * else, so cancelling everything is cancelling only its own.
 *
 * Web has no local notifications; every call here is a no-op there.
 */

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

let handlerSet = false;

/** Shows a reminder that arrives while the app is open, quietly. */
export function configureForeground(): void {
  if (!supported || handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
  });
}

export type Permission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function permission(): Promise<Permission> {
  if (!supported) return 'unsupported';
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    return current.canAskAgain ? 'undetermined' : 'denied';
  } catch (error) {
    logger.warn('Could not read notification permission', { error });
    return 'unsupported';
  }
}

/** Asks, once, at the moment she turns a reminder on — never at launch. */
export async function askPermission(): Promise<Permission> {
  if (!supported) return 'unsupported';
  try {
    const result = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    return result.granted ? 'granted' : 'denied';
  } catch (error) {
    logger.warn('Could not ask for notification permission', { error });
    return 'unsupported';
  }
}

export async function cancelAllReminders(): Promise<void> {
  if (!supported) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function applyPlan(plan: PlannedReminder[]): Promise<void> {
  if (!supported) return;
  await cancelAllReminders();
  if (plan.length === 0) return;
  if ((await permission()) !== 'granted') return;

  for (const reminder of plan) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: { title: reminder.title, body: reminder.body, data: { url: reminder.url } },
        trigger:
          reminder.trigger.kind === 'daily'
            ? {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: reminder.trigger.hour,
                minute: reminder.trigger.minute,
              }
            : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.trigger.at },
      });
    } catch (error) {
      logger.warn('Could not schedule a reminder', { error, id: reminder.id });
    }
  }
}

/** Where a tapped reminder wants to go, if anywhere this app knows. */
export function urlOf(response: Notifications.NotificationResponse | null): string | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}
