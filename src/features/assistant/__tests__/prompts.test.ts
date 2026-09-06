import type { IntentionId, ToneId } from '@/features/profile/profileStore';

import { dailyPrompt, personalGreeting, type PromptContext } from '../prompts';

const base: PromptContext = {
  name: 'James',
  tone: 'gentle',
  intentions: [],
  daysSinceLast: 2,
  hasEntryToday: false,
};

const TONES: ToneId[] = ['gentle', 'warm', 'direct', 'quiet'];

describe('the assistant has an actual voice', () => {
  it('says something different in every tone', () => {
    const lines = TONES.map((tone) => dailyPrompt({ ...base, tone }, 1));
    expect(new Set(lines).size).toBe(TONES.length);
  });

  it('always returns something to say', () => {
    for (const tone of TONES) {
      for (let seed = 0; seed < 32; seed += 1) {
        expect(dailyPrompt({ ...base, tone }, seed).length).toBeGreaterThan(0);
      }
    }
  });

  it('stays the same all day rather than fidgeting between renders', () => {
    expect(dailyPrompt(base, 12)).toEqual(dailyPrompt(base, 12));
  });
});

describe('what it asks depends on the situation', () => {
  it('opens differently for someone who has never written', () => {
    const first = dailyPrompt({ ...base, daysSinceLast: null }, 1);
    const usual = dailyPrompt(base, 1);
    expect(first).not.toEqual(usual);
  });

  it('acknowledges a gap without counting the days', () => {
    const line = dailyPrompt({ ...base, daysSinceLast: 30 }, 1);
    expect(line).not.toMatch(/\d/);
  });

  it('asks for more, not again, when today already has an entry', () => {
    const line = dailyPrompt({ ...base, hasEntryToday: true }, 1);
    expect(line.toLowerCase()).toMatch(/else|more/);
  });
});

describe('what someone is here for shapes the question', () => {
  it('draws on their reasons some of the time', () => {
    const intentions: IntentionId[] = ['through'];
    const lines = Array.from({ length: 30 }, (_, seed) =>
      dailyPrompt({ ...base, intentions }, seed),
    );

    expect(lines.some((line) => line === 'How are you holding up?')).toBe(true);
  });

  it('does not use them every single day', () => {
    const intentions: IntentionId[] = ['through'];
    const lines = Array.from({ length: 30 }, (_, seed) =>
      dailyPrompt({ ...base, intentions }, seed),
    );

    expect(new Set(lines).size).toBeGreaterThan(2);
  });
});

// The brief rules out gamification, and this is the copy where it would creep
// in first. Someone journalling through a hard month must never be counted at.
describe('it never keeps score', () => {
  it('mentions no numbers or streaks in any tone or situation', () => {
    for (const tone of TONES) {
      for (const daysSinceLast of [null, 0, 1, 3, 9, 60]) {
        for (const hasEntryToday of [true, false]) {
          for (let seed = 0; seed < 12; seed += 1) {
            const line = dailyPrompt(
              { ...base, tone, daysSinceLast, hasEntryToday, intentions: ['through', 'change'] },
              seed,
            );
            expect(line).not.toMatch(/\d/);
            expect(line.toLowerCase()).not.toMatch(/streak|in a row|missed|haven't written/);
          }
        }
      }
    }
  });
});

describe('greeting', () => {
  const morning = new Date(2026, 8, 6, 9);

  it('uses the name', () => {
    expect(personalGreeting('James', 'gentle', morning)).toEqual('Good morning, James');
  });

  it('does not say "good morning" like a receptionist when asked for warmth', () => {
    expect(personalGreeting('James', 'warm', morning)).toEqual('Hey James');
  });

  it('says nothing at all for someone who asked to be left alone', () => {
    expect(personalGreeting('James', 'quiet', morning)).toEqual('');
  });

  it('copes with no name yet', () => {
    expect(personalGreeting('', 'gentle', morning)).toEqual('Good morning');
  });
});
