import {
  fromDateKey,
  greeting,
  isSameDay,
  longDate,
  monthGrid,
  toDateKey,
  yearsAgo,
} from '../date';

describe('toDateKey', () => {
  // The bug this guards: toISOString() converts to UTC, so an entry written at
  // 11pm in London on the 30th would be filed under the 31st — and then turn up
  // on the wrong day in the calendar and a year late in On This Day.
  it('uses local time, not UTC', () => {
    const lateEvening = new Date(2026, 7, 30, 23, 30);
    expect(toDateKey(lateEvening)).toEqual('2026-08-30');
  });

  it('pads month and day', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toEqual('2026-01-05');
  });

  it('round-trips through fromDateKey', () => {
    const key = '2026-03-14';
    expect(toDateKey(fromDateKey(key))).toEqual(key);
  });
});

describe('longDate', () => {
  it('reads the way a diary writes a date', () => {
    expect(longDate(new Date(2026, 7, 30))).toEqual('Sunday, 30 August');
  });
});

describe('greeting', () => {
  it.each([
    [7, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('at %i:00 says %s', (hour, expected) => {
    expect(greeting(new Date(2026, 7, 30, hour))).toEqual(expected);
  });
});

describe('monthGrid', () => {
  it('starts weeks on Monday', () => {
    // 1 August 2026 is a Saturday, so five blanks precede it.
    const cells = monthGrid(2026, 7);
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(cells[5]).toEqual('2026-08-01');
  });

  it('covers every day of the month', () => {
    const cells = monthGrid(2026, 7).filter((cell) => cell !== null);
    expect(cells).toHaveLength(31);
  });

  it('handles a leap February', () => {
    const cells = monthGrid(2028, 1).filter((cell) => cell !== null);
    expect(cells).toHaveLength(29);
  });

  it('handles a month starting on Monday with no leading blanks', () => {
    // June 2026 starts on a Monday.
    expect(monthGrid(2026, 5)[0]).toEqual('2026-06-01');
  });
});

describe('yearsAgo', () => {
  it('counts calendar years', () => {
    expect(yearsAgo(new Date(2024, 7, 30), new Date(2026, 7, 30))).toEqual(2);
  });
});

describe('isSameDay', () => {
  it('ignores the time of day', () => {
    expect(isSameDay(new Date(2026, 7, 30, 1), new Date(2026, 7, 30, 23))).toBe(true);
    expect(isSameDay(new Date(2026, 7, 30), new Date(2026, 7, 31))).toBe(false);
  });
});
