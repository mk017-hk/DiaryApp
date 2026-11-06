/**
 * What the assistant is told when it reflects on one entry, and what is done
 * with its answer.
 *
 * Kept apart from the request handling so the rules can be read in one place
 * and tested without a network. This is the file to argue about.
 *
 * The daily question (`../assistant`) only ever asks. This is the part she
 * asked to be different: after writing or recording something, a few lines of
 * notes in her own terms and a handful of suggestions. The lines it must not
 * cross are the same ones — it describes what she said and never what it
 * means about her, it never diagnoses, it never counts, and it never stands
 * in for a person when somebody is in danger.
 */

export interface ReflectionSource {
  entry_id: string;
  diary_id: string;
  entry_date: string;
  updated_at: string;
  mood: number | null;
  thread_title: string | null;
  body: string | null;
  transcript: string | null;
  emotions: string[];
}

export type SuggestionKind = 'write' | 'try' | 'keep';

export interface Suggestion {
  kind: SuggestionKind;
  text: string;
}

export interface Reflection {
  notes: string;
  themes: string[];
  feelings: string[];
  suggestions: Suggestion[];
}

export const SYSTEM_PROMPT = `
You are the quiet presence inside someone's private diary. They have just
written or recorded something, and they have asked you to read it and leave a
few notes beside it — the way a trusted friend might jot in the margin. They
can delete your notes, and they can ask you never to read something again.

WHAT YOU WRITE
- notes: two to four short sentences, in the second person, saying what they
  talked about, in their own words where you can. Describe; do not interpret.
  "You talked about the walk home, and the leaves finally turning" is right.
  "You seem to be finding peace" is not.
- themes: up to four short labels for what it was about, one to three words
  each, lower case — "work", "your sister", "the move".
- feelings_named: only feelings they named or stated plainly, in their words.
  If they did not name one, leave it empty. Never infer a feeling.
- suggestions: up to three, each optional and each drawn from something they
  actually said. Three kinds:
  - write: a question they might write or talk about next time, about
    something they raised.
  - try: one small, concrete, kind thing they could do, when what they said
    points to it — something they said helped, something they said they wanted
    to do. Never a health, medical, legal or financial recommendation, never
    "see a professional", never a diet, exercise plan or productivity tip.
  - keep: a moment worth holding on to, when they said it mattered — to save,
    to tell someone, or to put in a letter to their future self.
  If nothing honest fits, give fewer suggestions, or none.

WHAT YOU NEVER DO
- Never diagnose, label or explain them to themselves: no "anxiety",
  "depression", "trauma", "burnout", "you seem", "it sounds like you".
- Never tell them what they should do. Suggestions are offers, phrased as
  "you could" or "maybe", never "you should" or "you need to".
- Never count days, mention a gap, or praise consistency.
- Never evaluate, cheer or console: no "that's wonderful", "I'm sorry",
  "well done", "that must have been hard".
- Never mention being an AI, a model, or reading anything.
- The text may be a rough transcript of speech. Ignore recognition errors
  rather than quoting them, and never correct how someone speaks.

IF SOMEONE IS IN DANGER
If what they wrote or said describes self-harm, suicidal thoughts, abuse, or
being in danger, set needs_support to true and leave notes, themes,
feelings_named and suggestions empty. The app will show real people they can
talk to. Do not try to counsel them yourself.

TONE
Plain, warm, unhurried, short. British English. No exclamation marks. No emoji.
`.trim();

/** The shape the model must answer in, enforced by structured outputs. */
export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    needs_support: { type: 'boolean' },
    notes: { type: 'string' },
    themes: { type: 'array', items: { type: 'string' } },
    feelings_named: { type: 'array', items: { type: 'string' } },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['write', 'try', 'keep'] },
          text: { type: 'string' },
        },
        required: ['kind', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['needs_support', 'notes', 'themes', 'feelings_named', 'suggestions'],
  additionalProperties: false,
} as const;

const MOOD_WORDS: Record<number, string> = {
  1: 'heavy',
  2: 'low',
  3: 'even',
  4: 'good',
  5: 'bright',
};

/** Long enough for a long voice note; past this the prompt is bloating. */
const MAX_TEXT = 12_000;

/** Everything there is to read: what was written, then what was said. */
export function readableText(source: ReflectionSource): string {
  const body = (source.body ?? '').trim();
  const said = (source.transcript ?? '').trim();
  return [body, said].filter((part) => part.length > 0).join('\n\n');
}

/**
 * The entry, as the model sees it.
 *
 * Text only. No ids it could echo back, no storage paths, no email. If the
 * entry is longer than the limit, it is cut at the limit and the model is told
 * so — a silent cut would have it describe the first half as the whole.
 */
export function buildEntryPrompt(source: ReflectionSource, name: string): string {
  const text = readableText(source);
  const cut = text.length > MAX_TEXT;
  const body = cut ? text.slice(0, MAX_TEXT) : text;

  const facts = [
    name.trim().length > 0 ? `Their name is ${name.trim()}.` : null,
    `Written on ${source.entry_date}.`,
    source.thread_title !== null
      ? `It is part of a story they are keeping called "${source.thread_title}".`
      : null,
    source.mood !== null && MOOD_WORDS[source.mood] !== undefined
      ? `They marked the day as ${MOOD_WORDS[source.mood] ?? ''}.`
      : null,
    source.emotions.length > 0
      ? `They chose these words for how it felt: ${source.emotions.join(', ')}.`
      : null,
    source.transcript !== null && source.transcript.trim().length > 0
      ? 'Part of it is a transcript of something they said out loud.'
      : null,
    cut ? 'It is long, and only the first part is included below.' : null,
  ].filter((line): line is string => line !== null);

  return [...facts, '', '<entry>', body, '</entry>'].join('\n');
}

export type ReflectOutcome =
  | { kind: 'reflection'; reflection: Reflection }
  | { kind: 'support' }
  | { kind: 'withheld'; reason: string };

/** Never, in notes or suggestions. */
const ALWAYS_BANNED: RegExp[] = [
  /\b(streak|in a row|consistent|consistency|keep it up|well done|good job|proud of you)\b/,
  /\b(haven't|have not|hadn't)\s+(written|recorded|posted)\b/,
  /\b(since you last|it's been a while|been a while since)\b/,
  /\b(you seem|you sound|it sounds like|you must be|you're clearly|you are clearly)\b/,
  /\b(you should|you need to|you have to|you must)\b/,
  /\b(that's wonderful|that's great|i'm sorry|so sorry|that must have been)\b/,
  /\b(as an ai|language model|i read your|i've read your)\b/,
];

/**
 * Clinical words: allowed only when she used them herself.
 *
 * "You talked about your anxiety" after she wrote about her anxiety is
 * describing. The same sentence after she wrote about a long day is a
 * diagnosis, and that is the line.
 */
const HERS_TO_SAY = [
  'anxiety',
  'anxious',
  'depress',
  'trauma',
  'burnout',
  'burnt out',
  'panic',
  'disorder',
  'diagnos',
];

/** Never as advice: an app suggesting a doctor is standing in for one. */
const NOT_A_SUGGESTION: RegExp[] = [
  /\b(therapist|therapy|counsell?or|counsell?ing|doctor|gp|nurse|medication|medicine|pills?|psychiatr|psycholog)/,
  /\b(diet|calorie|calories|weight|fasting|workout plan)\b/,
  /\b(professional help|seek help|get help|reach out to a)\b/,
];

/**
 * The copy rules, as patterns. Blunt on purpose: a miss costs one note.
 *
 * `source` is what she wrote and said, lower-cased, so a word she used herself
 * is not held against the note that repeats it.
 */
export function breaksCopyRules(
  text: string,
  source = '',
  as: 'notes' | 'suggestion' = 'notes',
): boolean {
  const lower = text.toLowerCase();
  if (ALWAYS_BANNED.some((pattern) => pattern.test(lower))) return true;
  if (HERS_TO_SAY.some((word) => lower.includes(word) && !source.includes(word))) return true;
  if (as === 'suggestion' && NOT_A_SUGGESTION.some((pattern) => pattern.test(lower))) return true;
  return false;
}

const clean = (text: string, max: number) => text.replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Reads the model's answer, and enforces what the prompt only asks for.
 *
 * Fails closed. Notes that break a rule withhold the whole reflection — a
 * diagnosis beside somebody's entry is worse than nothing beside it. A
 * suggestion that breaks one is dropped on its own; the others may be fine.
 */
export function interpret(parsed: unknown, sourceText = ''): ReflectOutcome {
  if (parsed === null || typeof parsed !== 'object')
    return { kind: 'withheld', reason: 'unreadable' };
  const value = parsed as Record<string, unknown>;
  const source = sourceText.toLowerCase();

  if (value.needs_support === true) return { kind: 'support' };

  const notes = typeof value.notes === 'string' ? clean(value.notes, 1200) : '';
  if (notes.length === 0) return { kind: 'withheld', reason: 'empty' };
  if (breaksCopyRules(notes, source)) return { kind: 'withheld', reason: 'copy_rules' };

  const strings = (list: unknown, limit: number, max: number) =>
    (Array.isArray(list) ? list : [])
      .filter((item): item is string => typeof item === 'string')
      .map((item) => clean(item, max))
      .filter((item) => item.length > 0 && !breaksCopyRules(item, source))
      .slice(0, limit);

  const suggestions = (Array.isArray(value.suggestions) ? value.suggestions : [])
    .filter(
      (item): item is { kind: unknown; text: unknown } => item !== null && typeof item === 'object',
    )
    .flatMap((item): Suggestion[] => {
      const kind = item.kind;
      const text = typeof item.text === 'string' ? clean(item.text, 280) : '';
      if (kind !== 'write' && kind !== 'try' && kind !== 'keep') return [];
      if (text.length === 0 || breaksCopyRules(text, source, 'suggestion')) return [];
      return [{ kind, text }];
    })
    .slice(0, 3);

  return {
    kind: 'reflection',
    reflection: {
      notes,
      themes: strings(value.themes, 4, 40),
      feelings: strings(value.feelings_named, 4, 30),
      suggestions,
    },
  };
}
