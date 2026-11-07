import { AwayClock } from '../awayClock';

/**
 * When the app counts as having been away.
 *
 * The sequences below are the ones iOS actually reports. The first is the bug:
 * a Face ID prompt makes the app `inactive` and then `active` again, without
 * the app ever being left.
 */

it('does not count a Face ID prompt, or any system prompt, as being away', () => {
  const clock = new AwayClock();
  expect(clock.change('inactive', 1_000)).toBeNull();
  expect(clock.change('active', 1_400)).toBeNull();
});

it('does not count a glance at the app switcher', () => {
  const clock = new AwayClock();
  clock.change('inactive', 1_000);
  expect(clock.change('active', 5_000)).toBeNull();
});

it('counts leaving the app, from the moment it reached the background', () => {
  const clock = new AwayClock();
  clock.change('inactive', 1_000);
  clock.change('background', 2_000);
  expect(clock.change('active', 32_000)).toBe(30_000);
});

it('counts a return straight away as having been away, so "Immediately" locks', () => {
  const clock = new AwayClock();
  clock.change('background', 1_000);
  expect(clock.change('active', 1_000)).toBe(0);
});

it('measures each departure afresh', () => {
  const clock = new AwayClock();
  clock.change('background', 1_000);
  clock.change('active', 2_000);
  clock.change('inactive', 3_000);
  expect(clock.change('active', 3_500)).toBeNull();
});

it('forgets a departure once the app has been unlocked', () => {
  const clock = new AwayClock();
  clock.change('background', 1_000);
  clock.reset();
  expect(clock.change('active', 90_000)).toBeNull();
});
