import { addDays, daysBetween, fromDateKey } from '@/lib/date';

import type { ReminderSettings, TimeOfDay } from './reminderSettings';

/**
 * What should be scheduled, worked out without touching the OS.
 *
 * Pure, so every rule below is tested to the minute: which reminders exist,
 * what they say in discreet mode and out of it, and that nothing is ever
 * scheduled for a moment already past.
 *
 * iOS keeps at most 64 pending local notifications per app and silently drops
 * the rest, so the one-off kinds are capped well under that.
 */

export type Trigger = { kind: 'daily'; hour: number; minute: number } | { kind: 'once'; at: Date };

export interface PlannedReminder {
  id: string;
  title: string;
  body: string;
  /** Where tapping it goes. */
  url: string;
  trigger: Trigger;
}

export interface PlanContext {
  now: Date;
  /** Predicted first day of the next period, when cycle tracking is on. */
  nextPeriod: string | null;
  /** Predicted start of the next fertile window. */
  nextFertile: string | null;
  /** Days sealed letters open on. */
  letterDays: string[];
  /** Upcoming days that have a memory to bring back. */
  memoryDays: string[];
  cycleTracking: boolean;
  onPill: boolean;
}

const MAX_LETTERS = 10;
const MAX_MEMORIES = 14;
const TITLE = 'Diary';

function at(day: string, time: TimeOfDay): Date {
  const date = fromDateKey(day);
  date.setHours(time.hour, time.minute, 0, 0);
  return date;
}

function inFuture(date: Date, now: Date): boolean {
  return date.getTime() > now.getTime();
}

export function planReminders(settings: ReminderSettings, context: PlanContext): PlannedReminder[] {
  const { now, discreet } = { now: context.now, discreet: settings.discreet };
  const plan: PlannedReminder[] = [];
  const say = (open: string, quiet: string) => (discreet ? quiet : open);

  if (settings.checkIn.enabled) {
    plan.push({
      id: 'check-in',
      title: TITLE,
      body: 'A minute for today, whenever you are ready.',
      url: '/',
      trigger: { kind: 'daily', hour: settings.checkIn.hour, minute: settings.checkIn.minute },
    });
  }

  if (settings.pill.enabled && context.cycleTracking && context.onPill) {
    plan.push({
      id: 'pill',
      title: TITLE,
      body: say('Time for your pill.', 'Your daily reminder.'),
      url: '/log',
      trigger: { kind: 'daily', hour: settings.pill.hour, minute: settings.pill.minute },
    });
  }

  if (settings.period.enabled && context.cycleTracking && context.nextPeriod !== null) {
    const day = addDays(context.nextPeriod, -settings.period.daysBefore);
    const when = at(day, settings.period);
    const ahead = daysBetween(day, context.nextPeriod);
    if (inFuture(when, now)) {
      plan.push({
        id: 'period',
        title: TITLE,
        body: say(
          ahead === 0
            ? 'Your period may start today.'
            : ahead === 1
              ? 'Your period may start tomorrow.'
              : `Your period may start in ${String(ahead)} days.`,
          'Something to look at in your calendar.',
        ),
        url: '/calendar',
        trigger: { kind: 'once', at: when },
      });
    }
  }

  if (settings.fertile.enabled && context.cycleTracking && context.nextFertile !== null) {
    const when = at(context.nextFertile, settings.fertile);
    if (inFuture(when, now)) {
      plan.push({
        id: 'fertile',
        title: TITLE,
        body: say(
          'Your fertile window may start today. An estimate, not contraception.',
          'A note from your calendar.',
        ),
        url: '/calendar',
        trigger: { kind: 'once', at: when },
      });
    }
  }

  if (settings.letters.enabled) {
    const days = [...new Set(context.letterDays)].sort();
    for (const day of days) {
      const when = at(day, { hour: 9, minute: 0 });
      if (!inFuture(when, now)) continue;
      if (plan.filter((item) => item.id.startsWith('letter-')).length >= MAX_LETTERS) break;
      plan.push({
        id: `letter-${day}`,
        title: TITLE,
        body: say(
          'A letter you wrote to yourself is ready to open.',
          'Something is waiting for you.',
        ),
        url: '/letters',
        trigger: { kind: 'once', at: when },
      });
    }
  }

  if (settings.memories.enabled) {
    const days = [...new Set(context.memoryDays)].sort();
    for (const day of days) {
      const when = at(day, { hour: 10, minute: 0 });
      if (!inFuture(when, now)) continue;
      if (plan.filter((item) => item.id.startsWith('memory-')).length >= MAX_MEMORIES) break;
      plan.push({
        id: `memory-${day}`,
        title: TITLE,
        // Never what was written. A memory is chosen by her, by opening it.
        body: say('You wrote something on this day before.', 'Something from your diary.'),
        url: '/',
        trigger: { kind: 'once', at: when },
      });
    }
  }

  return plan;
}
