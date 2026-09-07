import { DEFAULT_EMOTIONS } from '@/services/supabase/emotions';

import { __testing } from '../EmotionPicker';

const { balancedFew } = __testing;

/**
 * Which feelings are on screen before you ask for more.
 *
 * This looks like a layout detail and is not. The vocabulary is seeded
 * warm-first, so taking the first six by sort order showed Happy, Loved,
 * Grateful, Excited, Calm and Peaceful — and hid every difficult word behind
 * a "More" link. Someone having the worst week of their year would have had to
 * go looking for the word for it, past a row of feelings they did not have.
 */

describe('the six shown first', () => {
  const first = balancedFew(DEFAULT_EMOTIONS);

  it('shows six', () => {
    expect(first).toHaveLength(6);
  });

  // The bug this file exists for.
  it('is not six pleasant words', () => {
    const families = new Set(
      first.map((slug) => DEFAULT_EMOTIONS.find((e) => e.slug === slug)?.family),
    );

    expect(families.size).toBeGreaterThan(1);
    expect(families.has('heavy')).toBe(true);
    expect(families.has('restless')).toBe(true);
  });

  it('offers a word for a hard day without having to go looking', () => {
    expect(first).toContain('sad');
  });

  it('offers a word for a good one too', () => {
    expect(first).toContain('happy');
  });

  it('never repeats one', () => {
    expect(new Set(first).size).toEqual(first.length);
  });

  it('takes them in family order, so the row reads as a spread', () => {
    const families = first.map((slug) => DEFAULT_EMOTIONS.find((e) => e.slug === slug)?.family);

    // The first pass takes one from each family before any family gets a second.
    expect(new Set(families.slice(0, 5)).size).toEqual(5);
  });
});

describe('when the vocabulary is smaller than the fold', () => {
  it('shows what there is rather than looping forever', () => {
    const few = DEFAULT_EMOTIONS.slice(0, 3);

    expect(balancedFew(few)).toHaveLength(3);
  });

  it('copes with nothing at all', () => {
    expect(balancedFew([])).toEqual([]);
  });

  it('copes with a single family', () => {
    const warm = DEFAULT_EMOTIONS.filter((emotion) => emotion.family === 'warm');

    expect(balancedFew(warm)).toEqual(warm.map((emotion) => emotion.slug));
  });
});
