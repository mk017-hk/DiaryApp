import { planReminders, type PlanContext } from '../plan';
import { DEFAULT_REMINDERS, type ReminderSettings } from '../reminderSettings';

/**
 * What gets scheduled.
 *
 * The rules that matter most are the quiet ones: nothing is scheduled unless
 * it was turned on, nothing for a moment already gone, and nothing on a lock
 * screen says more than she has agreed to.
 */

// 6 November 2026, 08:00 local.
const now = new Date(2026, 10, 6, 8, 0, 0);

const context: PlanContext = {
  now,
  nextPeriod: '2026-11-12',
  nextFertile: '2026-11-22',
  letterDays: [],
  memoryDays: [],
  cycleTracking: true,
  onPill: true,
};

const on = (changes: Partial<ReminderSettings>): ReminderSettings => ({
  ...DEFAULT_REMINDERS,
  ...changes,
});

it('schedules nothing until something is turned on', () => {
  expect(planReminders(DEFAULT_REMINDERS, context)).toEqual([]);
});

it('repeats the check-in daily at the chosen time', () => {
  const plan = planReminders(on({ checkIn: { enabled: true, hour: 21, minute: 15 } }), context);
  expect(plan).toEqual([
    expect.objectContaining({ id: 'check-in', trigger: { kind: 'daily', hour: 21, minute: 15 } }),
  ]);
});

describe('the period reminder', () => {
  const period = { enabled: true, daysBefore: 2, hour: 9, minute: 0 };

  it('fires the chosen number of days before, at the chosen time', () => {
    const [reminder] = planReminders(on({ period }), context);
    expect(reminder?.trigger).toEqual({ kind: 'once', at: new Date(2026, 10, 10, 9, 0, 0) });
  });

  it('says nothing specific in discreet mode, which is the default', () => {
    const [reminder] = planReminders(on({ period }), context);
    expect(reminder?.body).toBe('Something to look at in your calendar.');
    expect(reminder?.body).not.toMatch(/period/i);
  });

  it('says what it is when discreet mode is off', () => {
    const [reminder] = planReminders(on({ period, discreet: false }), context);
    expect(reminder?.body).toBe('Your period may start in 2 days.');
  });

  it('is not scheduled for a moment already past', () => {
    // Due 10 November at 09:00; it is now the 10th at 10:00.
    const late = { ...context, now: new Date(2026, 10, 10, 10, 0, 0) };
    expect(planReminders(on({ period }), late)).toEqual([]);
  });

  it('is not scheduled with cycle tracking off', () => {
    expect(planReminders(on({ period }), { ...context, cycleTracking: false })).toEqual([]);
  });
});

it('reminds about the pill only for someone who said they take it', () => {
  const pill = { enabled: true, hour: 8, minute: 30 };
  expect(planReminders(on({ pill }), context)).toHaveLength(1);
  expect(planReminders(on({ pill }), { ...context, onPill: false })).toEqual([]);
});

it('marks the fertile window with the warning that it is not contraception', () => {
  const [reminder] = planReminders(
    on({ discreet: false, fertile: { enabled: true, hour: 9, minute: 0 } }),
    context,
  );
  expect(reminder?.body).toMatch(/not contraception/);
});

it('schedules one reminder per day a letter opens, and none for days gone', () => {
  const plan = planReminders(on({ letters: { enabled: true } }), {
    ...context,
    letterDays: ['2027-01-01', '2027-01-01', '2026-11-01', '2026-12-25'],
  });
  expect(plan.map((reminder) => reminder.id)).toEqual(['letter-2026-12-25', 'letter-2027-01-01']);
});

it('never puts what was written into a memory reminder', () => {
  const plan = planReminders(on({ discreet: false, memories: { enabled: true } }), {
    ...context,
    memoryDays: ['2026-11-07'],
  });
  expect(plan[0]?.body).toBe('You wrote something on this day before.');
});

it('stays well under the 64 notifications iOS will hold', () => {
  const days = Array.from(
    { length: 60 },
    (_, index) => `2027-0${String(1 + (index % 9))}-${String(10 + (index % 18))}`,
  );
  const everything = on({
    checkIn: { enabled: true, hour: 20, minute: 0 },
    period: { enabled: true, daysBefore: 2, hour: 9, minute: 0 },
    fertile: { enabled: true, hour: 9, minute: 0 },
    pill: { enabled: true, hour: 9, minute: 0 },
    letters: { enabled: true },
    memories: { enabled: true },
  });
  const plan = planReminders(everything, { ...context, letterDays: days, memoryDays: days });
  expect(plan.length).toBeLessThanOrEqual(30);
});
