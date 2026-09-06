import type { IntentionId, ToneId } from '@/features/profile/profileStore';
import { greeting } from '@/lib/date';

/**
 * What the assistant says.
 *
 * Templated for now and model-written later; the screens do not change when
 * that happens, only where the sentence comes from. Starting here means the
 * loop works offline, costs nothing, and cannot fail mid-sentence.
 *
 * Two things shape every line: the tone someone picked, which is the voice,
 * and what they said they were here for, which is the subject. A person who
 * chose "barely at all" and a person who chose "like a friend" should not be
 * reading the same app.
 *
 * Rules the copy follows, and must keep following once a model writes it:
 * never count days, never praise consistency, never guilt an absence. Someone
 * journalling through the worst month of their life should not be told they
 * broke a streak.
 */

export interface PromptContext {
  name: string;
  tone: ToneId;
  intentions: IntentionId[];
  /** Days since the last entry, or null if this is the first. */
  daysSinceLast: number | null;
  hasEntryToday: boolean;
}

type Situation = 'first' | 'again-today' | 'returning' | 'after-a-while';

const BY_TONE: Record<ToneId, Record<Situation, string[]>> = {
  gentle: {
    first: [
      'There is no right way to start. What is on your mind?',
      'Take your time. What does today feel like?',
    ],
    'again-today': [
      'Anything else you would like to keep from today?',
      'Something else on your mind?',
    ],
    returning: [
      'How are you feeling today?',
      'What is sitting with you right now?',
      'What would you want to remember about today?',
      'How has today been treating you?',
    ],
    'after-a-while': [
      'It has been a little while. How are you?',
      'Whenever you are ready — how have things been?',
    ],
  },
  warm: {
    first: ['So — tell me about today.', 'Right then. What is going on with you?'],
    'again-today': ['Anything else?', 'What else happened?'],
    returning: [
      'Hey you. How has today been?',
      'How are you doing today?',
      'What has today been like?',
      'Go on then — how are you?',
    ],
    'after-a-while': ['Been a while. How are you doing?', 'There you are. How have you been?'],
  },
  direct: {
    first: ['What is on your mind?', 'How is today going?'],
    'again-today': ['Anything else?', 'More?'],
    returning: ['How was today?', 'What happened today?', 'How are you?', 'What is today like?'],
    'after-a-while': ['How have things been?', 'What has been happening?'],
  },
  quiet: {
    first: ['Start anywhere.', 'Whenever you like.'],
    'again-today': ['More?', 'Anything else?'],
    returning: ['Today?', 'How are you?', 'What is today like?', 'Anything?'],
    'after-a-while': ['How have you been?', 'Still here.'],
  },
};

/**
 * Occasional prompts drawn from what someone said they were here for. Mixed in
 * rather than used every day — a diary that asks the same shaped question
 * forever stops being worth answering.
 */
const BY_INTENTION: Record<IntentionId, string[]> = {
  everyday: [
    'What is one small thing from today worth keeping?',
    'Anything ordinary you would be sad to forget?',
  ],
  through: [
    'How are you holding up?',
    'What is today asking of you?',
    'Where are you with it today?',
  ],
  change: [
    'What feels different lately?',
    'What would last year’s you make of today?',
    'Anything you are seeing differently now?',
  ],
  record: [
    'What should the record say about today?',
    'What happened that you will want the details of?',
  ],
  people: ['Who was in your day?', 'Anyone you want to remember today with?'],
  creative: ['What are you turning over?', 'Anything you want to think out loud about?'],
};

function situationFor(context: PromptContext): Situation {
  if (context.daysSinceLast === null) return 'first';
  if (context.hasEntryToday) return 'again-today';
  return context.daysSinceLast >= 7 ? 'after-a-while' : 'returning';
}

/**
 * `seed` keeps the question stable for a given day rather than reshuffling on
 * every render, which would feel like the app was fidgeting.
 */
export function dailyPrompt(context: PromptContext, seed = new Date().getDate()): string {
  const situation = situationFor(context);
  const voice = BY_TONE[context.tone][situation];

  // Every third day, and only on an ordinary return, ask something drawn from
  // why they are here. The rest of the time, the plain question is better.
  const useIntention = situation === 'returning' && context.intentions.length > 0 && seed % 3 === 0;

  if (useIntention) {
    const intention = context.intentions[seed % context.intentions.length];
    if (intention !== undefined) {
      const pool = BY_INTENTION[intention];
      const line = pool[seed % pool.length];
      if (line !== undefined) return line;
    }
  }

  return voice[seed % voice.length] ?? voice[0] ?? 'How are you today?';
}

/**
 * "Good morning, James" — or nothing at all if they asked to be left alone,
 * since a greeting is the first thing to go when someone wants quiet.
 */
export function personalGreeting(name: string, tone: ToneId, now: Date = new Date()): string {
  if (tone === 'quiet') return '';

  const base = greeting(now);
  if (name.length === 0) return base;

  // A friend does not say "Good afternoon".
  if (tone === 'warm') return `Hey ${name}`;
  if (tone === 'direct') return name;

  return `${base}, ${name}`;
}
