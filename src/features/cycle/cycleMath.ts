import { addDays, dayNumber, daysBetween, fromDayNumber } from '@/lib/date';

/**
 * The arithmetic of a cycle.
 *
 * Pure functions over the days somebody has marked as period days. Nothing
 * here reads storage or the clock: `today` is always passed in, which is what
 * makes every prediction below testable to the day.
 *
 * The model is the calendar method every period tracker starts from, stated
 * plainly so nobody mistakes it for more:
 *
 *  - A **period** is a run of marked days. One unmarked day inside a run does
 *    not split it, because a light day nobody bothered to log is far more
 *    common than two periods two days apart.
 *  - A **cycle** runs from the first day of one period to the first day of the
 *    next.
 *  - **Ovulation** is estimated at fourteen days before the next period. That
 *    is the textbook luteal phase, and it is an estimate — individual luteal
 *    phases vary, which is why the fertile window is a window.
 *  - The **fertile window** is the five days before the estimated ovulation and
 *    the day after it.
 *
 * None of this is contraception, and the screens say so where a prediction is
 * shown. A calendar estimate cannot see a cycle that has changed this month.
 */

export interface CycleSettings {
  /** Whether the app shows cycle tracking at all. Off is a complete answer. */
  enabled: boolean;
  /** What she told us, used until there are enough logged cycles to average. */
  cycleLength: number;
  periodLength: number;
  /** Shows the pill row in the log, and its reminder. */
  onPill: boolean;
}

export const DEFAULT_CYCLE_SETTINGS: CycleSettings = {
  enabled: false,
  cycleLength: 28,
  periodLength: 5,
  onPill: false,
};

/** The bounds offered in settings. Wide on purpose: real cycles are. */
export const CYCLE_LENGTH_RANGE = { min: 15, max: 60 } as const;
export const PERIOD_LENGTH_RANGE = { min: 1, max: 12 } as const;

/** Cycles outside this are almost always a missed log, not a real cycle. */
const PLAUSIBLE_CYCLE = { min: 15, max: 90 } as const;

/** How many recent cycles the averages are drawn from. */
const AVERAGE_OVER = 6;

const LUTEAL_DAYS = 14;
const FERTILE_BEFORE = 5;
const FERTILE_AFTER = 1;

export interface Period {
  /** 'YYYY-MM-DD', first marked day. */
  start: string;
  /** Last marked day. */
  end: string;
  /** Days from start to end, inclusive. */
  length: number;
}

export interface Cycle {
  start: string;
  /** Days until the next period began. */
  length: number;
  periodLength: number;
}

export interface CycleSummary {
  /** Rounded, and what every prediction uses. */
  averageCycle: number;
  averagePeriod: number;
  /** True when the averages come from her own logged cycles. */
  learned: boolean;
  /** Completed cycles, most recent first. */
  cycles: Cycle[];
  /** Shortest and longest of the cycles averaged over, or null with fewer than two. */
  range: { shortest: number; longest: number } | null;
}

export type Phase = 'period' | 'follicular' | 'fertile' | 'ovulation' | 'luteal';

export interface CycleDay {
  /** Day 1 is the first day of the most recent period. Null before any period. */
  dayOfCycle: number | null;
  phase: Phase | null;
  /** In a period, by log or by the period's usual length. */
  inPeriod: boolean;
  /** Which day of the period, when in one. */
  periodDay: number | null;
  /** The predicted first day of the next period. */
  nextPeriod: string | null;
  /** Days from today until `nextPeriod`. Zero on the day; never negative. */
  daysUntilNext: number | null;
  /** Days past the predicted start with no period marked. */
  daysLate: number;
  ovulation: string | null;
  fertile: { start: string; end: string } | null;
}

/**
 * Periods, from the days marked as period days.
 *
 * Accepts the days in any order and with duplicates, which is what a set of
 * logs read back from storage looks like.
 */
export function periodsFrom(periodDays: Iterable<string>): Period[] {
  const numbers = [...new Set(periodDays)].map(dayNumber).sort((a, b) => a - b);
  const periods: Period[] = [];

  let start: number | undefined;
  let end: number | undefined;

  for (const day of numbers) {
    if (start === undefined || end === undefined) {
      start = day;
      end = day;
      continue;
    }
    // One empty day bridges; two do not.
    if (day - end <= 2) {
      end = day;
      continue;
    }
    periods.push(toPeriod(start, end));
    start = day;
    end = day;
  }

  if (start !== undefined && end !== undefined) periods.push(toPeriod(start, end));
  return periods;
}

function toPeriod(start: number, end: number): Period {
  return { start: fromDayNumber(start), end: fromDayNumber(end), length: end - start + 1 };
}

/** Completed cycles, oldest first: every period that has a next one. */
export function completedCycles(periods: Period[]): Cycle[] {
  const cycles: Cycle[] = [];
  for (let index = 0; index + 1 < periods.length; index += 1) {
    const current = periods[index];
    const next = periods[index + 1];
    if (current === undefined || next === undefined) continue;
    cycles.push({
      start: current.start,
      length: daysBetween(current.start, next.start),
      periodLength: current.length,
    });
  }
  return cycles;
}

const mean = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Her averages, from her own cycles where there are any.
 *
 * Implausible cycles are left out of the average but kept in the history: a
 * ninety-day gap is real information about the logging, and somebody looking
 * at her history should see it, but it should not drag every prediction three
 * weeks late.
 *
 * One logged cycle is enough to start learning from. Waiting for three, as
 * some trackers do, means two months of predictions built on a number she
 * guessed at during onboarding.
 */
export function summarise(periods: Period[], settings: CycleSettings): CycleSummary {
  const cycles = completedCycles(periods);
  const recent = cycles
    .filter((cycle) => cycle.length >= PLAUSIBLE_CYCLE.min && cycle.length <= PLAUSIBLE_CYCLE.max)
    .slice(-AVERAGE_OVER);

  // The period currently running is not finished, so its length is not yet
  // known; only periods that ended before the latest one count.
  const finishedPeriods = periods.slice(0, -1).slice(-AVERAGE_OVER);

  const averageCycle = recent.length > 0 ? Math.round(mean(recent.map((c) => c.length))) : null;
  const averagePeriod =
    finishedPeriods.length > 0 ? Math.round(mean(finishedPeriods.map((p) => p.length))) : null;

  const lengths = recent.map((cycle) => cycle.length);

  return {
    averageCycle: averageCycle ?? settings.cycleLength,
    averagePeriod: averagePeriod ?? settings.periodLength,
    learned: averageCycle !== null,
    cycles: [...cycles].reverse(),
    range:
      lengths.length >= 2
        ? { shortest: Math.min(...lengths), longest: Math.max(...lengths) }
        : null,
  };
}

/** Estimated ovulation for a cycle that begins at `start` and lasts `length`. */
function ovulationFor(start: string, length: number, periodLength: number): string {
  // A very short cycle would otherwise put ovulation inside the period.
  const day = Math.max(length - LUTEAL_DAYS, periodLength);
  return addDays(start, day);
}

function phaseWithin(
  date: string,
  start: string,
  length: number,
  periodLength: number,
  periodEnd: string,
): Phase {
  if (daysBetween(date, periodEnd) >= 0) return 'period';
  const ovulation = ovulationFor(start, length, periodLength);
  const offset = daysBetween(ovulation, date);
  if (offset === 0) return 'ovulation';
  if (offset >= -FERTILE_BEFORE && offset <= FERTILE_AFTER) return 'fertile';
  return offset < 0 ? 'follicular' : 'luteal';
}

/**
 * Where a day falls, looking back with everything now known.
 *
 * For a day inside a completed cycle this uses that cycle's real length, so a
 * symptom logged in March is placed against the cycle March actually had, not
 * against today's average.
 */
export function phaseOn(date: string, periods: Period[], summary: CycleSummary): Phase | null {
  let containing: Period | undefined;
  let next: Period | undefined;

  for (const period of periods) {
    if (daysBetween(period.start, date) >= 0) {
      containing = period;
    } else {
      next = period;
      break;
    }
  }

  if (containing === undefined) return null;

  const length =
    next !== undefined ? daysBetween(containing.start, next.start) : summary.averageCycle;
  const periodEnd =
    next === undefined && isOngoing(containing, date)
      ? addDays(containing.start, Math.max(containing.length, summary.averagePeriod) - 1)
      : containing.end;

  // Past the predicted end of an open cycle: late, which is still luteal.
  if (next === undefined && daysBetween(containing.start, date) >= length) return 'luteal';

  return phaseWithin(date, containing.start, length, summary.averagePeriod, periodEnd);
}

/**
 * Whether a period that was last marked recently is probably still going.
 *
 * Somebody who marks day one and then forgets for a day is still on her
 * period. A run that was last marked yesterday is taken to continue to its
 * usual length; one last marked two days ago or more is taken to be over.
 */
function isOngoing(period: Period, today: string): boolean {
  return daysBetween(period.end, today) <= 1;
}

/** Everything Today needs to say about the cycle. */
export function cycleOn(today: string, periods: Period[], summary: CycleSummary): CycleDay {
  const past = periods.filter((period) => daysBetween(period.start, today) >= 0);
  const last = past[past.length - 1];

  if (last === undefined) {
    return {
      dayOfCycle: null,
      phase: null,
      inPeriod: false,
      periodDay: null,
      nextPeriod: null,
      daysUntilNext: null,
      daysLate: 0,
      ovulation: null,
      fertile: null,
    };
  }

  const dayOfCycle = daysBetween(last.start, today) + 1;
  const markedToday = daysBetween(today, last.end) >= 0;
  const expectedLength = Math.max(last.length, summary.averagePeriod);
  const inPeriod = markedToday || (isOngoing(last, today) && dayOfCycle <= expectedLength);

  const predicted = addDays(last.start, summary.averageCycle);
  const untilPredicted = daysBetween(today, predicted);
  const daysLate = inPeriod ? 0 : Math.max(0, -untilPredicted);

  const ovulation = ovulationFor(last.start, summary.averageCycle, summary.averagePeriod);

  return {
    dayOfCycle,
    phase: phaseOn(today, periods, summary),
    inPeriod,
    periodDay: inPeriod ? dayOfCycle : null,
    // Late is late: the next period is "any day now", not a date in the past.
    nextPeriod: daysLate > 0 ? today : predicted,
    daysUntilNext: daysLate > 0 ? 0 : untilPredicted,
    daysLate,
    ovulation,
    fertile: {
      start: addDays(ovulation, -FERTILE_BEFORE),
      end: addDays(ovulation, FERTILE_AFTER),
    },
  };
}

export type DayMark = 'period' | 'predicted-period' | 'fertile' | 'ovulation';

/**
 * What the calendar draws on each day between `from` and `to`.
 *
 * Marked days are drawn as they were logged. Fertile windows are drawn for
 * past cycles too, estimated from the length each one really had. Predicted
 * periods only ever fall after today — a prediction for a day already lived is
 * not a prediction.
 */
export function calendarMarks(
  from: string,
  to: string,
  today: string,
  periodDays: Set<string>,
  periods: Period[],
  summary: CycleSummary,
): Map<string, DayMark> {
  const marks = new Map<string, DayMark>();
  const within = (date: string) => daysBetween(from, date) >= 0 && daysBetween(date, to) >= 0;
  const put = (date: string, mark: DayMark) => {
    if (within(date) && !marks.has(date)) marks.set(date, mark);
  };

  for (const day of periodDays) put(day, 'period');

  const fertileAround = (ovulation: string) => {
    put(ovulation, 'ovulation');
    for (let offset = -FERTILE_BEFORE; offset <= FERTILE_AFTER; offset += 1) {
      if (offset !== 0) put(addDays(ovulation, offset), 'fertile');
    }
  };

  // Past cycles, at the length they actually were.
  for (const cycle of completedCycles(periods)) {
    fertileAround(ovulationFor(cycle.start, cycle.length, summary.averagePeriod));
  }

  const last = periods.filter((period) => daysBetween(period.start, today) >= 0).at(-1);
  if (last === undefined) return marks;

  const now = cycleOn(today, periods, summary);

  // The rest of a period that is still going.
  if (now.inPeriod) {
    const expected = Math.max(last.length, summary.averagePeriod);
    for (let offset = 0; offset < expected; offset += 1) {
      const day = addDays(last.start, offset);
      if (daysBetween(today, day) > 0) put(day, 'predicted-period');
    }
  }

  // The current cycle's window, then each predicted cycle after it.
  fertileAround(ovulationFor(last.start, summary.averageCycle, summary.averagePeriod));

  let start = now.nextPeriod;
  for (let guard = 0; start !== null && guard < 24 && daysBetween(start, to) >= 0; guard += 1) {
    for (let offset = 0; offset < summary.averagePeriod; offset += 1) {
      const day = addDays(start, offset);
      if (daysBetween(today, day) > 0 || (now.daysLate > 0 && day === today)) {
        put(day, 'predicted-period');
      }
    }
    fertileAround(ovulationFor(start, summary.averageCycle, summary.averagePeriod));
    start = addDays(start, summary.averageCycle);
  }

  return marks;
}

/** The words Today uses for a phase. Descriptions, not instructions. */
export const PHASE_LABELS: Record<Phase, string> = {
  period: 'Period',
  follicular: 'Follicular phase',
  fertile: 'Fertile window',
  ovulation: 'Estimated ovulation',
  luteal: 'Luteal phase',
};
