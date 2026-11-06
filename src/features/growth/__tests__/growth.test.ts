import type { Entry } from '@/features/entries';

import { feelingsByMonth, namesMentioned, recurringWords } from '../growth';

const entry = (body: string, entryDate = '2026-11-01', emotions: string[] = []): Entry => ({
  id: `${entryDate}-${body.slice(0, 8)}`,
  entryDate,
  entryAt: `${entryDate}T12:00:00.000Z`,
  body,
  mood: null,
  emotions,
  media: [],
  isFavourite: false,
  createdAt: `${entryDate}T12:00:00.000Z`,
  updatedAt: `${entryDate}T12:00:00.000Z`,
});

describe('recurring words', () => {
  it('counts a word once per entry, so one long entry cannot dominate', () => {
    const result = recurringWords([
      entry('garden garden garden garden'),
      entry('the garden was quiet'),
      entry('quiet again, the piano'),
      entry('piano lessons'),
    ]);
    expect(result).toEqual([
      { word: 'garden', count: 2 },
      { word: 'piano', count: 2 },
      { word: 'quiet', count: 2 },
    ]);
  });

  it('leaves out short and common words, and anything said only once', () => {
    const result = recurringWords([
      entry('I felt that it was really today'),
      entry('I felt that it was'),
    ]);
    expect(result).toEqual([]);
  });
});

describe('names', () => {
  it('finds capitalised words mid-sentence that recur', () => {
    const result = namesMentioned([
      entry('Walked with Ellie to the river.'),
      entry('Called Ellie. Then Mum rang.'),
      entry('Lunch with Mum and Ellie.'),
    ]);
    expect(result).toEqual([
      { word: 'Ellie', count: 3 },
      { word: 'Mum', count: 2 },
    ]);
  });

  it('ignores the first word of a sentence, weekdays and months', () => {
    const result = namesMentioned([
      entry('Walked home on Monday. Walked again in March.'),
      entry('See you on Monday in March.'),
    ]);
    expect(result).toEqual([]);
  });

  it('ignores a word she also writes in lower case', () => {
    const result = namesMentioned([
      entry('Back at Work again.'),
      entry('Long day at Work.'),
      entry('Too much work.'),
    ]);
    expect(result).toEqual([]);
  });
});

it('names the feelings of each month, newest first, from entries and logs', () => {
  const result = feelingsByMonth(
    [entry('a', '2026-10-03', ['calm']), entry('b', '2026-11-02', ['anxious', 'calm'])],
    [
      {
        date: '2026-11-04',
        period: false,
        symptoms: [],
        moods: ['anxious'],
        intimacy: [],
        updatedAt: '',
      },
    ],
  );
  expect(result).toEqual([
    {
      month: '2026-11',
      top: [
        { word: 'anxious', count: 2 },
        { word: 'calm', count: 1 },
      ],
    },
    { month: '2026-10', top: [{ word: 'calm', count: 1 }] },
  ]);
});
