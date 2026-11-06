import {
  breaksCopyRules,
  buildEntryPrompt,
  interpret,
  OUTPUT_SCHEMA,
  SYSTEM_PROMPT,
  type ReflectionSource,
} from '../functions/reflect/prompt';

/**
 * What a reflection is allowed to say.
 *
 * Structured outputs guarantee the shape; these guarantee the rest. Pure, so
 * they can afford to be exhaustive about what a model actually writes.
 */

const source = (over: Partial<ReflectionSource> = {}): ReflectionSource => ({
  entry_id: 'entry-1',
  diary_id: 'diary-1',
  entry_date: '2026-11-05',
  updated_at: '2026-11-05T20:00:00.000Z',
  mood: 4,
  thread_title: null,
  body: 'Long day at work. The walk home helped, the leaves are finally turning.',
  transcript: null,
  emotions: ['Calm'],
  ...over,
});

const answer = (over: Record<string, unknown> = {}) => ({
  needs_support: false,
  notes: 'You talked about a long day at work, and the walk home that helped.',
  themes: ['work', 'the walk home'],
  feelings_named: [],
  suggestions: [
    { kind: 'try', text: 'You could take the long way home again tomorrow.' },
    { kind: 'write', text: 'What was it about the walk that helped?' },
  ],
  ...over,
});

describe('the prompt', () => {
  it('sends what was written and what was said, and nothing that identifies the entry', () => {
    const prompt = buildEntryPrompt(source({ transcript: 'I said this out loud.' }), 'Mari');
    expect(prompt).toContain('Long day at work');
    expect(prompt).toContain('I said this out loud.');
    expect(prompt).toContain('Their name is Mari.');
    expect(prompt).not.toContain('entry-1');
    expect(prompt).not.toContain('diary-1');
  });

  it('says when a long entry has been cut, rather than cutting it silently', () => {
    const prompt = buildEntryPrompt(source({ body: 'word '.repeat(5000) }), '');
    expect(prompt).toContain('only the first part is included');
  });

  it('asks for support to be shown, not given, when someone is in danger', () => {
    expect(SYSTEM_PROMPT).toContain('needs_support');
    expect(SYSTEM_PROMPT).toContain('Do not try to counsel them');
  });

  it('is a schema structured outputs accepts: closed objects, everything required', () => {
    expect(OUTPUT_SCHEMA.additionalProperties).toBe(false);
    expect([...OUTPUT_SCHEMA.required].sort()).toEqual(
      Object.keys(OUTPUT_SCHEMA.properties).sort(),
    );
    expect(OUTPUT_SCHEMA.properties.suggestions.items.additionalProperties).toBe(false);
  });
});

describe('reading the answer', () => {
  it('keeps a good reflection as it is', () => {
    const outcome = interpret(answer(), source().body ?? '');
    expect(outcome).toEqual({
      kind: 'reflection',
      reflection: {
        notes: 'You talked about a long day at work, and the walk home that helped.',
        themes: ['work', 'the walk home'],
        feelings: [],
        suggestions: [
          { kind: 'try', text: 'You could take the long way home again tomorrow.' },
          { kind: 'write', text: 'What was it about the walk that helped?' },
        ],
      },
    });
  });

  it('shows support instead of notes when the model says someone is in danger', () => {
    expect(interpret(answer({ needs_support: true }))).toEqual({ kind: 'support' });
  });

  it.each([
    ['a diagnosis she did not make', 'You seem to be dealing with burnout at work.'],
    ['an instruction', 'You should rest more this week.'],
    ['counting', 'This is your fifth entry in a row about work — keep it up.'],
    ['consoling', "I'm sorry the day was so long."],
    ['mentioning the machinery', 'As an AI, I noticed you talked about work.'],
  ])('withholds notes containing %s', (_label, notes) => {
    expect(interpret(answer({ notes }), source().body ?? '').kind).toBe('withheld');
  });

  it('allows a clinical word she used herself', () => {
    const text = 'My anxiety was bad on the train again.';
    const outcome = interpret(
      answer({ notes: 'You talked about your anxiety on the train.' }),
      text,
    );
    expect(outcome.kind).toBe('reflection');
  });

  it('drops a suggestion that stands in for a professional, and keeps the rest', () => {
    const outcome = interpret(
      answer({
        suggestions: [
          { kind: 'try', text: 'Maybe talk to your GP about how tired you are.' },
          { kind: 'keep', text: 'You could save this one, for the leaves.' },
        ],
      }),
      source().body ?? '',
    );
    expect(outcome.kind === 'reflection' && outcome.reflection.suggestions).toEqual([
      { kind: 'keep', text: 'You could save this one, for the leaves.' },
    ]);
  });

  it('lets the notes describe a doctor she mentioned, which is not advice', () => {
    expect(breaksCopyRules('You talked about the appointment with your doctor.', '', 'notes')).toBe(
      false,
    );
    expect(breaksCopyRules('You could see your doctor.', '', 'suggestion')).toBe(true);
  });

  it('caps the lists and ignores anything of the wrong shape', () => {
    const outcome = interpret(
      answer({
        themes: ['a', 'b', 'c', 'd', 'e', 'f', 42],
        suggestions: [
          { kind: 'write', text: 'One?' },
          { kind: 'write', text: 'Two?' },
          { kind: 'write', text: 'Three?' },
          { kind: 'write', text: 'Four?' },
          { kind: 'shout', text: 'Wrong kind' },
        ],
      }),
    );
    expect(outcome.kind === 'reflection' && outcome.reflection.themes).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(outcome.kind === 'reflection' && outcome.reflection.suggestions).toHaveLength(3);
  });

  it('withholds an empty or unreadable answer', () => {
    expect(interpret(null).kind).toBe('withheld');
    expect(interpret(answer({ notes: '   ' })).kind).toBe('withheld');
  });
});
