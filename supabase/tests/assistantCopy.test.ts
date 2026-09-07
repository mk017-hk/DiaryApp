import {
  buildUserPrompt,
  citedEntryIds,
  interpret,
  SYSTEM_PROMPT,
  violatesCopyRules,
  type ContextRow,
} from '../functions/assistant/prompt';

/**
 * What the assistant is allowed to say.
 *
 * The prompt is the request. This is the enforcement, and it fails closed: a
 * reply that trips any rule becomes silence rather than being shown. A day
 * with no question is a completely acceptable day in a diary; a day where
 * somebody grieving is told they have missed four days is not.
 *
 * Pure functions, so these run in milliseconds and can afford to be exhaustive
 * about the phrasings a model actually produces.
 */

const row = (over: Partial<ContextRow> = {}): ContextRow => ({
  entry_id: 'entry-1',
  entry_date: '2026-09-01',
  mood: 3,
  thread_title: null,
  body: 'The kitchen light was still on when I got home.',
  transcript: null,
  ...over,
});

describe('counting, streaks and absence', () => {
  // The single rule this product cares about most. "You haven't written in
  // five days" aimed at somebody in the middle of a loss is the opposite of
  // what this app is for.
  it.each([
    "you haven't written in 5 days",
    'you have not written for 3 weeks',
    'it has been 12 days since you last wrote',
    "that's a 6 day streak",
    'four days in a row now',
    'you missed a couple of days',
    "it's been a while",
    'since you last recorded something',
    'well done for being so consistent',
    'keep it up',
    'good job',
    'you write every day, which is lovely',
  ])('refuses %p', (text) => {
    expect(violatesCopyRules(text)).toBe(true);
    expect(interpret(text).kind).toEqual('silence');
  });
});

describe('diagnosing, interpreting and advising', () => {
  it.each([
    'you seem anxious about your sister',
    'you sound overwhelmed lately',
    'it sounds like you are struggling',
    'this suggests some unresolved grief',
    'you should talk to someone about it',
    'you might want to try journalling about it',
    'i noticed you mention her a lot',
    'i can tell this is hard',
  ])('refuses %p', (text) => {
    expect(violatesCopyRules(text)).toBe(true);
  });

  // The line the product notes drew, in both directions: name what they wrote,
  // never what it means about them.
  it('allows naming what was written', () => {
    expect(violatesCopyRules('you wrote about your sister twice this week')).toBe(false);
  });

  // The subject moving does not make it a different rule. This is the exact
  // example the product notes drew the line on, in a phrasing that slipped
  // past the first version of the filter.
  it.each([
    'your relationship with your sister seems strained',
    'you seem anxious about your sister',
    'the week appears to have been a heavy one',
    'that must have been difficult',
    'you must be exhausted',
  ])('refuses interpreting what it means: %p', (text) => {
    expect(violatesCopyRules(text)).toBe(true);
  });
});

describe('evaluating', () => {
  it.each([
    "that's wonderful",
    "that's great to hear",
    'that sounds hard',
    "i'm sorry to hear that",
    'i am so proud of you',
  ])('refuses %p', (text) => {
    expect(violatesCopyRules(text)).toBe(true);
  });
});

describe('naming the mechanism', () => {
  // Nothing should remind you that you are using an app. It is a diary; the
  // word for a diary is not "entry".
  it.each([
    'what would you like to journal about today',
    'your last entry mentioned the garden',
    'anything you want to log',
    'take a moment to reflect on your diary',
  ])('refuses %p', (text) => {
    expect(violatesCopyRules(text)).toBe(true);
  });
});

describe('what it does allow', () => {
  it.each([
    'what did the light look like this morning?',
    'what happened with the flat in the end?',
    'is your mum still staying with you?',
    'what would you say to her if she were sitting there?',
    'you mentioned the hospital appointment — how did it go?',
  ])('allows %p', (text) => {
    expect(violatesCopyRules(text)).toBe(false);
    expect(interpret(text)).toEqual({ kind: 'question', content: text });
  });
});

describe('the two sentinels', () => {
  it('turns a crisis reply into support rather than a question', () => {
    expect(interpret('SUPPORT_NEEDED').kind).toEqual('support');
  });

  it('takes silence as a real answer', () => {
    expect(interpret('NOTHING_TO_ASK').kind).toEqual('silence');
    expect(interpret('   ').kind).toEqual('silence');
  });

  // Both sentinels are checked before anything else, so a model that wraps
  // one in politeness still routes correctly.
  it('recognises a sentinel inside a longer reply', () => {
    expect(interpret('I think SUPPORT_NEEDED here').kind).toEqual('support');
  });
});

describe('length', () => {
  it('withholds a reply long enough to be a monologue rather than a question', () => {
    expect(interpret('why? '.repeat(80)).kind).toEqual('silence');
  });

  it('keeps an ordinary one', () => {
    expect(interpret('how did today go?').kind).toEqual('question');
  });
});

describe('what actually gets sent', () => {
  // Text only, always. No storage paths, no ids the model could echo back, no
  // media, no email address.
  it('sends no ids, paths or media', () => {
    const prompt = buildUserPrompt(
      [row({ entry_id: '11111111-1111-1111-1111-111111111111' })],
      'Marika',
    );

    expect(prompt).not.toContain('11111111');
    expect(prompt).not.toContain('storage');
    expect(prompt).not.toContain('http');
  });

  it('sends the writing, the date and the thread it belongs to', () => {
    const prompt = buildUserPrompt([row({ thread_title: 'Trying again' })], 'Marika');

    expect(prompt).toContain('kitchen light');
    expect(prompt).toContain('2026-09-01');
    expect(prompt).toContain('Trying again');
  });

  it('falls back to what was said when nothing was written', () => {
    const prompt = buildUserPrompt(
      [row({ body: '', transcript: 'What I said out loud instead.' })],
      'Marika',
    );

    expect(prompt).toContain('What I said out loud instead.');
  });

  it('leaves the name out rather than inventing one', () => {
    expect(buildUserPrompt([row()], '')).not.toContain("person's name");
  });

  it('truncates a very long entry rather than sending all of it', () => {
    const prompt = buildUserPrompt([row({ body: 'a'.repeat(5000) })], 'Marika');

    expect(prompt.length).toBeLessThan(2000);
  });
});

describe('what a question says it was drawn from', () => {
  // `based_on_entry_ids` is the honesty feature of this app. It is only honest
  // if it lists exactly what was sent — no more, and no less.
  it('cites every entry that contributed text', () => {
    expect(citedEntryIds([row({ entry_id: 'a' }), row({ entry_id: 'b' })])).toEqual(['a', 'b']);
  });

  it('does not cite an entry whose text never made it into the prompt', () => {
    expect(
      citedEntryIds([row({ entry_id: 'a' }), row({ entry_id: 'b', body: '', transcript: null })]),
    ).toEqual(['a']);
  });
});

describe('the instructions themselves', () => {
  it('states the crisis rule, which is the one that cannot be left to tone', () => {
    expect(SYSTEM_PROMPT).toContain('SUPPORT_NEEDED');
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('self-harm');
  });

  it('states that silence is permitted', () => {
    expect(SYSTEM_PROMPT).toContain('NOTHING_TO_ASK');
  });

  it('forbids counting days in the instructions, not only in the filter', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('never count days');
  });
});
