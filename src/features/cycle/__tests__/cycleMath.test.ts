import { addDays } from '@/lib/date';

import {
  calendarMarks,
  completedCycles,
  cycleOn,
  DEFAULT_CYCLE_SETTINGS,
  periodsFrom,
  phaseOn,
  summarise,
} from '../cycleMath';

/**
 * The arithmetic every cycle screen trusts.
 *
 * Dates are written out rather than computed wherever it matters, so a
 * failing test reads as a calendar: "the period starting 1 March should
 * predict 29 March", not "start + averageCycle".
 */

const settings = { ...DEFAULT_CYCLE_SETTINGS, enabled: true };

/** `length` consecutive days from `start`. */
const run = (start: string, length: number): string[] =>
  Array.from({ length }, (_, index) => addDays(start, index));

describe('periods', () => {
  it('groups consecutive days into one period', () => {
    expect(periodsFrom(run('2026-03-01', 5))).toEqual([
      { start: '2026-03-01', end: '2026-03-05', length: 5 },
    ]);
  });

  it('bridges a single unlogged day', () => {
    expect(periodsFrom(['2026-03-01', '2026-03-02', '2026-03-04'])).toEqual([
      { start: '2026-03-01', end: '2026-03-04', length: 4 },
    ]);
  });

  it('does not bridge two', () => {
    expect(periodsFrom(['2026-03-01', '2026-03-04'])).toHaveLength(2);
  });

  it('accepts days out of order and repeated', () => {
    expect(periodsFrom(['2026-03-03', '2026-03-01', '2026-03-02', '2026-03-01'])).toEqual([
      { start: '2026-03-01', end: '2026-03-03', length: 3 },
    ]);
  });

  it('crosses month and year boundaries', () => {
    expect(periodsFrom(run('2026-12-30', 4))).toEqual([
      { start: '2026-12-30', end: '2027-01-02', length: 4 },
    ]);
  });

  it('measures cycles from start to start', () => {
    const periods = periodsFrom([...run('2026-01-01', 5), ...run('2026-01-30', 4)]);
    expect(completedCycles(periods)).toEqual([
      { start: '2026-01-01', length: 29, periodLength: 5 },
    ]);
  });
});

describe('averages', () => {
  it('falls back to what she said until a cycle has been logged', () => {
    const summary = summarise(periodsFrom(run('2026-03-01', 5)), {
      ...settings,
      cycleLength: 31,
      periodLength: 6,
    });
    expect(summary).toMatchObject({ averageCycle: 31, averagePeriod: 6, learned: false });
  });

  it('learns from a single logged cycle', () => {
    const periods = periodsFrom([...run('2026-01-01', 4), ...run('2026-01-31', 4)]);
    expect(summarise(periods, settings)).toMatchObject({
      averageCycle: 30,
      averagePeriod: 4,
      learned: true,
    });
  });

  it('leaves an implausible gap out of the average but keeps it in the history', () => {
    const periods = periodsFrom([
      ...run('2025-09-01', 5),
      ...run('2025-09-29', 5), // 28
      ...run('2026-01-10', 5), // 103 — a missed log
      ...run('2026-02-07', 5), // 28
    ]);
    const summary = summarise(periods, settings);
    expect(summary.averageCycle).toBe(28);
    expect(summary.cycles.map((cycle) => cycle.length)).toEqual([28, 103, 28]);
  });

  it('reports the range only once there are two cycles to compare', () => {
    const one = periodsFrom([...run('2026-01-01', 4), ...run('2026-01-29', 4)]);
    const three = periodsFrom([
      ...run('2026-01-01', 4),
      ...run('2026-01-27', 4),
      ...run('2026-02-28', 4),
    ]);
    expect(summarise(one, settings).range).toBeNull();
    expect(summarise(three, settings).range).toEqual({ shortest: 26, longest: 32 });
  });

  it('does not count the period still running towards the average length', () => {
    const periods = periodsFrom([...run('2026-01-01', 5), ...run('2026-01-29', 1)]);
    expect(summarise(periods, settings).averagePeriod).toBe(5);
  });
});

describe('today', () => {
  const periods = periodsFrom(run('2026-03-01', 5));
  const summary = summarise(periods, settings);

  it('says nothing before any period is logged', () => {
    expect(cycleOn('2026-03-10', [], summarise([], settings))).toMatchObject({
      dayOfCycle: null,
      nextPeriod: null,
      phase: null,
    });
  });

  it('counts the first day of the period as day one', () => {
    expect(cycleOn('2026-03-01', periods, summary)).toMatchObject({
      dayOfCycle: 1,
      inPeriod: true,
      periodDay: 1,
      phase: 'period',
    });
  });

  it('predicts the next period one average cycle on', () => {
    expect(cycleOn('2026-03-10', periods, summary)).toMatchObject({
      dayOfCycle: 10,
      inPeriod: false,
      nextPeriod: '2026-03-29',
      daysUntilNext: 19,
    });
  });

  it('estimates ovulation fourteen days before it, with the window around', () => {
    expect(cycleOn('2026-03-10', periods, summary)).toMatchObject({
      ovulation: '2026-03-15',
      fertile: { start: '2026-03-10', end: '2026-03-16' },
      phase: 'fertile',
    });
    expect(cycleOn('2026-03-15', periods, summary).phase).toBe('ovulation');
    expect(cycleOn('2026-03-08', periods, summary).phase).toBe('follicular');
    expect(cycleOn('2026-03-20', periods, summary).phase).toBe('luteal');
  });

  it('assumes a period marked yesterday is still going', () => {
    const started = periodsFrom(['2026-03-01']);
    const s = summarise(started, settings);
    expect(cycleOn('2026-03-02', started, s)).toMatchObject({ inPeriod: true, periodDay: 2 });
    // Two days unmarked, and it is taken to be over.
    expect(cycleOn('2026-03-03', started, s).inPeriod).toBe(false);
  });

  it('counts days late instead of predicting a date already gone', () => {
    expect(cycleOn('2026-04-02', periods, summary)).toMatchObject({
      daysLate: 4,
      nextPeriod: '2026-04-02',
      daysUntilNext: 0,
      phase: 'luteal',
    });
  });

  it('is not late on the predicted day itself', () => {
    expect(cycleOn('2026-03-29', periods, summary)).toMatchObject({
      daysLate: 0,
      daysUntilNext: 0,
    });
  });

  it('keeps ovulation out of the period in a very short cycle', () => {
    const short = summarise(periodsFrom(run('2026-03-01', 6)), {
      ...settings,
      cycleLength: 16,
      periodLength: 6,
    });
    const now = cycleOn('2026-03-02', periodsFrom(run('2026-03-01', 6)), short);
    // The day after her usual six-day period at the earliest, not day 3.
    expect(now.ovulation).toBe('2026-03-07');
  });
});

describe('looking back', () => {
  // Two real cycles of different lengths.
  const periods = periodsFrom([
    ...run('2026-01-01', 5),
    ...run('2026-02-02', 5), // 32 days
    ...run('2026-02-28', 5), // 26 days
  ]);
  const summary = summarise(periods, settings);

  it('places a day against the cycle it actually fell in', () => {
    // January's cycle was 32 days: ovulation on day 19, 19 January.
    expect(phaseOn('2026-01-19', periods, summary)).toBe('ovulation');
    // February's was 26: ovulation on day 13, 14 February.
    expect(phaseOn('2026-02-14', periods, summary)).toBe('ovulation');
  });

  it('has nothing to say about a day before the first period', () => {
    expect(phaseOn('2025-12-20', periods, summary)).toBeNull();
  });
});

describe('the calendar', () => {
  const periodDays = new Set(run('2026-03-01', 5));
  const periods = periodsFrom(periodDays);
  const summary = summarise(periods, settings);

  it('draws logged days, the window and the next predicted period', () => {
    const marks = calendarMarks(
      '2026-03-01',
      '2026-04-30',
      '2026-03-10',
      periodDays,
      periods,
      summary,
    );
    expect(marks.get('2026-03-01')).toBe('period');
    expect(marks.get('2026-03-15')).toBe('ovulation');
    expect(marks.get('2026-03-12')).toBe('fertile');
    expect(marks.get('2026-03-29')).toBe('predicted-period');
    expect(marks.get('2026-04-02')).toBe('predicted-period');
    expect(marks.get('2026-04-03')).toBeUndefined();
    // And the window of the predicted cycle: 29 March + (28 − 14) = 12 April.
    expect(marks.get('2026-04-12')).toBe('ovulation');
  });

  it('never predicts a day that has already passed', () => {
    const marks = calendarMarks(
      '2026-03-01',
      '2026-04-30',
      '2026-04-05',
      periodDays,
      periods,
      summary,
    );
    for (const [date, mark] of marks) {
      if (mark === 'predicted-period') expect(date >= '2026-04-05').toBe(true);
    }
  });

  it('keeps to the range it was asked for', () => {
    const marks = calendarMarks(
      '2026-03-10',
      '2026-03-20',
      '2026-03-10',
      periodDays,
      periods,
      summary,
    );
    for (const date of marks.keys()) {
      expect(date >= '2026-03-10' && date <= '2026-03-20').toBe(true);
    }
  });

  it('draws nothing predicted before any period is logged', () => {
    expect(
      calendarMarks(
        '2026-03-01',
        '2026-03-31',
        '2026-03-10',
        new Set(),
        [],
        summarise([], settings),
      ).size,
    ).toBe(0);
  });
});
