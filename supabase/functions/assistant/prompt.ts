/**
 * What the assistant is told, and what it is told never to do.
 *
 * Kept apart from the request handling so the rules can be read in one place
 * and tested without a network. This is the file to argue about; the rest of
 * the function is plumbing.
 */

export interface ContextRow {
  entry_id: string;
  entry_date: string;
  mood: number | null;
  thread_title: string | null;
  body: string | null;
  transcript: string | null;
}

/**
 * The rules, in the order they matter.
 *
 * Every one of these is a line the product notes drew, and several of them are
 * there because the person using this app may be journalling through a
 * pregnancy loss. That is the stated use case, not an edge case, so the
 * constraints are written as constraints rather than preferences.
 */
export const SYSTEM_PROMPT = `
You are the quiet presence inside someone's private diary. You are not a
therapist, not a coach, and not a friend who gives advice. You ask one good
question, and then you get out of the way.

WHAT YOU DO
- Ask exactly one question, in one or two sentences.
- Draw it from what the person actually wrote. Refer to their own words and
  their own subjects.
- Prefer a question that follows something ongoing over one about yesterday.

WHAT YOU NEVER DO
- Never diagnose, interpret, or explain a person to themselves. "You wrote
  about your sister twice this week" is allowed. "You seem anxious about your
  sister" is not. Name what they wrote, never what it means about them.
- Never give advice, suggest an action, or recommend seeing anyone.
- Never count days, mention a gap, praise consistency, or refer to how often
  they write. No streaks. No "you haven't written since Tuesday". Somebody
  grieving does not need a participation score.
- Never congratulate, cheer, or evaluate. Not "that's wonderful", not "that
  sounds hard".
- Never use the words journal, entry, diary, log, or reflect.
- Never mention that you are a model, or that you read anything.

IF SOMEONE IS IN DANGER
If the writing describes self-harm, abuse, or a crisis, do not ask a question
and do not attempt to help. Reply with exactly:
SUPPORT_NEEDED
The app will show real resources. Attempting to counsel someone here would be
worse than saying nothing.

TONE
Plain, warm, unhurried, and short. Lowercase-simple language. No exclamation
marks. No emoji. If you cannot find anything worth asking about, reply with
exactly:
NOTHING_TO_ASK
`.trim();

/** The one reply that means "show the support screen, not a question". */
export const SUPPORT_SENTINEL = 'SUPPORT_NEEDED';

/** The one reply that means "say nothing today". Silence is a valid answer. */
export const SILENCE_SENTINEL = 'NOTHING_TO_ASK';

/** Longer than this and the model is monologuing rather than asking. */
const MAX_QUESTION_LENGTH = 240;

/** Enough of an entry to be recognisable, not so much that the prompt bloats. */
const MAX_EXCERPT = 700;

function excerpt(row: ContextRow): string {
  // The transcript is often the fuller record: a body may have been trimmed by
  // hand, what was said out loud never is.
  const text = (row.body ?? '').trim() || (row.transcript ?? '').trim();
  return text.length > MAX_EXCERPT ? `${text.slice(0, MAX_EXCERPT)}…` : text;
}

/**
 * The diary, as the model sees it.
 *
 * Text only, always. No storage paths, no ids the model could echo back, no
 * media, no email address, no name it was not given. What goes up is what was
 * written and when.
 */
export function buildUserPrompt(rows: ContextRow[], name: string): string {
  const usable = rows.filter((row) => excerpt(row).length > 0);

  const lines = usable.map((row) => {
    const thread = row.thread_title === null ? '' : ` [${row.thread_title}]`;
    const mood = row.mood === null ? '' : ` (mood ${String(row.mood)}/5)`;
    return `${row.entry_date}${thread}${mood}: ${excerpt(row)}`;
  });

  const who = name.trim().length > 0 ? `The person's name is ${name.trim()}.` : '';

  return [
    who,
    'Here is what they have written recently, oldest last.',
    '',
    ...lines,
    '',
    'Ask them one question.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Which entries a question was actually drawn from.
 *
 * Recorded on the message so a person can always see what it was based on.
 * That column is the honesty feature of this app, and it is only honest if it
 * lists what was really sent.
 */
export function citedEntryIds(rows: ContextRow[]): string[] {
  return rows.filter((row) => excerpt(row).length > 0).map((row) => row.entry_id);
}

export type AssistantOutcome =
  { kind: 'question'; content: string } | { kind: 'support' } | { kind: 'silence' };

/**
 * Reads the model's reply, and refuses several things it might do.
 *
 * A model told not to count days will still occasionally count days. The
 * prompt is the request; this is the enforcement, and it fails closed —
 * anything that trips a rule becomes silence rather than being shown. A day
 * with no question is a completely acceptable day in a diary.
 */
export function interpret(raw: string): AssistantOutcome {
  const text = raw.trim();

  if (text.length === 0) return { kind: 'silence' };
  if (text.includes(SUPPORT_SENTINEL)) return { kind: 'support' };
  if (text.includes(SILENCE_SENTINEL)) return { kind: 'silence' };
  if (text.length > MAX_QUESTION_LENGTH) return { kind: 'silence' };

  if (violatesCopyRules(text)) return { kind: 'silence' };

  return { kind: 'question', content: text };
}

/**
 * The copy rules, as patterns rather than hopes.
 *
 * Deliberately blunt. A false positive costs one day's question, which is
 * nothing; a false negative puts "you haven't written in 5 days" in front of
 * somebody having the worst week of their life.
 */
export function violatesCopyRules(text: string): boolean {
  const lower = text.toLowerCase();

  const banned: RegExp[] = [
    // Counting, streaks, and absence in every phrasing that came to mind.
    /\b\d+\s*(day|days|week|weeks|month|months)\b/,
    /\b(streak|in a row|consistent|consistency|keep it up|well done|good job)\b/,
    /\b(haven't|have not|hadn't|had not|havent)\s+(written|recorded|posted|been)/,
    /\b(you missed|you've missed|since you last|it's been a while|been a while)\b/,
    /\b(every day|daily habit|habit)\b/,

    // Naming the mechanism.
    /\b(journal|journalling|journaling|diary|entry|entries|log|logged)\b/,

    // Diagnosing or interpreting.
    //
    // `seems` and its relatives are banned outright rather than only after
    // "you". The rule the product drew is about naming what somebody wrote
    // rather than what it means about them, and "your relationship with your
    // sister seems strained" breaks it exactly as much as "you seem anxious"
    // does — it just moves the subject. A question does not need the word,
    // so the cost of banning it is one withheld day and no more.
    /\b(seems?|seemed|appears?|appeared)\b/,
    /\b(you sound|it sounds like|you're feeling|you are feeling|you must be)\b/,
    /\b(anxiety|depressed|depression|trauma|grief is|you should|you might want to|try to)\b/,
    /\b(i noticed you|i can tell|this suggests|which means you|that must have)\b/,

    // Evaluating.
    /\b(that's wonderful|that's great|that sounds hard|i'm sorry to hear|proud of you)\b/,
  ];

  return banned.some((pattern) => pattern.test(lower));
}
