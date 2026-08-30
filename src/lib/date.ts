/**
 * Dates as a diary writes them, not as a database stores them.
 */

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** 'YYYY-MM-DD' in local time — never toISOString, which shifts to UTC and
 *  can file an evening entry under the following day. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(year)}-${month}-${day}`;
}

export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** "Tuesday, 30 August" */
export function longDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()] ?? ''}, ${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ''}`;
}

/** "30 August 2024" */
export function fullDate(date: Date): string {
  return `${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ''} ${String(date.getFullYear())}`;
}

export function monthName(month: number): string {
  return MONTHS[month] ?? '';
}

/** "Good morning" / "Good afternoon" / "Good evening" */
export function greeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

/** Days in a month, plus the weekday the 1st falls on, for a calendar grid. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Weeks start on Monday, which is how a diary is laid out.
  const leading = (first.getDay() + 6) % 7;

  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toDateKey(new Date(year, month, day)));
  }
  return cells;
}

/** "2 years ago today" — for resurfaced memories. */
export function yearsAgo(then: Date, now: Date = new Date()): number {
  return now.getFullYear() - then.getFullYear();
}
