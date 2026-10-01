import type { Entry } from '@/features/entries';

import { summarise, texture, windowStart } from '../patterns';

/**
 * The shape of a stretch of diary.
 *
 * Two kinds of test here. The ordinary kind, that the arithmetic is right. And
 * a set that pin down what this module deliberately does not do: no average, no
 * score, no counting of days. Those are product promises rather than
 * implementation details, and the way they get broken is by somebody later
 * adding a helpful-looking summary line.
 */

const entry = (overrides: Partial<Entry> & { id: string; entryDate: string }): Entry => ({
  entryAt: `${overrides.entryDate}T09:00:00.000Z`,
  body: 'Something that happened.',
  mood: null,
  emotions: [],
  media: [],
  isFavourite: false,
  createdAt: `${overrides.entryDate}T09:00:00.000Z`,
  updatedAt: `${overrides.entryDate}T09:00:00.000Z`,
  ...overrides,
});

/** Noon, so no timezone can nudge it to the day either side. */
const on = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12);

describe('the window', () => {
  it('counts back inclusively, so a month of 30 reaches 29 days back', () => {
    expect(windowStart(on(2026, 6, 30), 30)).toEqual('2026-06-01');
  });

  it('crosses a month boundary', () => {
    expect(windowStart(on(2026, 3, 5), 30)).toEqual('2026-02-04');
  });

  it('crosses a year boundary', () => {
    expect(windowStart(on(2026, 1, 3), 30)).toEqual('2025-12-05');
  });

  it('takes a window of one day as today alone', () => {
    expect(windowStart(on(2026, 6, 15), 1)).toEqual('2026-06-15');
  });
});

describe('moods along the line', () => {
  const today = on(2026, 6, 30);

  it('reads oldest first, whatever order the entries arrive in', () => {
    const result = summarise(
      [
        entry({ id: 'c', entryDate: '2026-06-20', mood: 5 }),
        entry({ id: 'a', entryDate: '2026-06-10', mood: 2 }),
        entry({ id: 'b', entryDate: '2026-06-15', mood: 3 }),
      ],
      { today, days: 30 },
    );

    expect(result.moods.map((point) => point.entryId)).toEqual(['a', 'b', 'c']);
  });

  it('carries the entry id, so a point can be opened', () => {
    const result = summarise([entry({ id: 'e-1', entryDate: '2026-06-10', mood: 4 })], {
      today,
      days: 30,
    });

    expect(result.moods[0]).toEqual({ entryId: 'e-1', date: '2026-06-10', mood: 4 });
  });

  // Leaving the mood question unanswered is ordinary. It should mean one fewer
  // point on the line, not a day struck from the record.
  it('leaves an entry with no mood off the line but keeps the day', () => {
    const result = summarise([entry({ id: 'e-1', entryDate: '2026-06-10' })], { today, days: 30 });

    expect(result.moods).toEqual([]);
    expect(result.daysWritten.has('2026-06-10')).toBe(true);
  });

  it('ignores anything before the window', () => {
    const result = summarise(
      [
        entry({ id: 'old', entryDate: '2026-05-01', mood: 1 }),
        entry({ id: 'in', entryDate: '2026-06-10', mood: 4 }),
      ],
      { today, days: 30 },
    );

    expect(result.moods.map((point) => point.entryId)).toEqual(['in']);
  });

  it('includes both ends of the window', () => {
    const result = summarise(
      [
        entry({ id: 'first', entryDate: '2026-06-01', mood: 3 }),
        entry({ id: 'last', entryDate: '2026-06-30', mood: 3 }),
      ],
      { today, days: 30 },
    );

    expect(result.moods.map((point) => point.entryId)).toEqual(['first', 'last']);
  });

  it('narrows to one story when asked', () => {
    const result = summarise(
      [
        entry({ id: 'in-thread', entryDate: '2026-06-10', mood: 2, threadId: 't-1' }),
        entry({ id: 'elsewhere', entryDate: '2026-06-11', mood: 5, threadId: 't-2' }),
        entry({ id: 'loose', entryDate: '2026-06-12', mood: 4 }),
      ],
      { today, days: 30, threadId: 't-1' },
    );

    expect(result.moods.map((point) => point.entryId)).toEqual(['in-thread']);
  });
});

describe('the words she chose', () => {
  const today = on(2026, 6, 30);

  it('counts each one across the window', () => {
    const result = summarise(
      [
        entry({ id: 'a', entryDate: '2026-06-10', emotions: ['sad', 'lonely'] }),
        entry({ id: 'b', entryDate: '2026-06-11', emotions: ['sad'] }),
      ],
      { today, days: 30 },
    );

    expect(result.emotions).toEqual([
      { slug: 'sad', count: 2 },
      { slug: 'lonely', count: 1 },
    ]);
  });

  // Identical data must draw identically. A list that reshuffles between two
  // renders looks like something changed when nothing did.
  it('breaks a tie by name rather than by arrival', () => {
    const result = summarise(
      [
        entry({ id: 'a', entryDate: '2026-06-10', emotions: ['sad'] }),
        entry({ id: 'b', entryDate: '2026-06-11', emotions: ['angry'] }),
      ],
      { today, days: 30 },
    );

    expect(result.emotions.map((item) => item.slug)).toEqual(['angry', 'sad']);
  });

  it('counts the words on an entry that carried no mood', () => {
    const result = summarise([entry({ id: 'a', entryDate: '2026-06-10', emotions: ['calm'] })], {
      today,
      days: 30,
    });

    expect(result.emotions).toEqual([{ slug: 'calm', count: 1 }]);
  });

  it('reports none when none were chosen', () => {
    const result = summarise([entry({ id: 'a', entryDate: '2026-06-10' })], { today, days: 30 });

    expect(result.emotions).toEqual([]);
  });
});

describe('the span actually covered', () => {
  const today = on(2026, 6, 30);

  it('runs from the first day written to the last', () => {
    const result = summarise(
      [entry({ id: 'a', entryDate: '2026-06-08' }), entry({ id: 'b', entryDate: '2026-06-22' })],
      { today, days: 30 },
    );

    expect(result.span).toEqual({ from: '2026-06-08', to: '2026-06-22' });
  });

  // So the screen can say nothing at all rather than drawing an empty chart
  // with an axis and a date range, which looks like a report card for a month
  // somebody did not write in.
  it('is absent when the window holds nothing', () => {
    expect(summarise([], { today, days: 30 }).span).toBeNull();
  });
});

describe('the texture strip', () => {
  const today = on(2026, 6, 30);

  it('has one mark per day of the window, oldest first', () => {
    const strip = texture(new Set(), { today, days: 30 });

    expect(strip).toHaveLength(30);
    expect(strip[0]?.date).toEqual('2026-06-01');
    expect(strip[29]?.date).toEqual('2026-06-30');
  });

  it('marks the days that hold something', () => {
    const strip = texture(new Set(['2026-06-10']), { today, days: 30 });

    expect(strip.filter((day) => day.written).map((day) => day.date)).toEqual(['2026-06-10']);
  });

  it('marks nothing when nothing was written', () => {
    expect(texture(new Set(), { today, days: 30 }).every((day) => !day.written)).toBe(true);
  });
});

/**
 * The promises, as tests.
 *
 * These exist because the way they get broken is not a bug — it is somebody
 * adding something helpful. An average mood, a count of entries, a longest run.
 * Each is one line of plausible code, and each turns a diary into something you
 * can do badly at.
 */
describe('what this deliberately does not produce', () => {
  const today = on(2026, 6, 30);

  const result = summarise(
    [
      entry({ id: 'a', entryDate: '2026-06-10', mood: 1, emotions: ['sad'] }),
      entry({ id: 'b', entryDate: '2026-06-11', mood: 5 }),
      entry({ id: 'c', entryDate: '2026-06-28', mood: 3 }),
    ],
    { today, days: 30 },
  );

  it('offers no average, no score, no label for the month', () => {
    const keys = Object.keys(result);

    expect(keys).toEqual(['moods', 'emotions', 'daysWritten', 'span']);
    expect(JSON.stringify(result)).not.toMatch(/average|score|rating|summary/i);
  });

  // Seventeen days passed between the 11th and the 28th. Nothing here knows
  // that, and nothing here should: a gap in a diary is not a failure to report
  // back to the person who lived it.
  it('says nothing about gaps, streaks or how often she wrote', () => {
    expect(result).not.toHaveProperty('streak');
    expect(result).not.toHaveProperty('longestGap');
    expect(result).not.toHaveProperty('entryCount');
  });

  it('gives days as a set of dates rather than as a total', () => {
    expect(result.daysWritten).toBeInstanceOf(Set);
  });
});
