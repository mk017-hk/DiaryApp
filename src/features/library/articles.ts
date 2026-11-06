import type { Phase } from '@/features/cycle';

/**
 * Short reads, written for this app.
 *
 * General information only, kept to what is widely agreed — the NHS pages on
 * periods are the reference for the figures — and never a diagnosis. Each
 * piece ends by pointing somewhere better than an app when something is
 * worrying, because that is the most useful sentence in any of them.
 *
 * Kept short on purpose. Somebody opening one of these from Today is between
 * other things; a page they can finish is worth more than a complete one.
 */

export interface Article {
  id: string;
  title: string;
  /** One line, for the card. */
  summary: string;
  icon: string;
  /** Paragraphs. */
  body: string[];
  /** The phase this belongs to, so Today can offer it on the right day. */
  phase?: Phase;
}

const SEE_SOMEONE =
  'If something about your cycle is worrying you, or has changed and you do not know why, a GP or a sexual health clinic is the right place to ask. You do not need to be sure something is wrong to go.';

export const ARTICLES: Article[] = [
  {
    id: 'cycle-basics',
    title: 'Your cycle, in four parts',
    summary: 'What is happening across a month, and why the app draws it the way it does.',
    icon: 'sync',
    body: [
      'A menstrual cycle is counted from the first day of one period to the first day of the next. The often-quoted 28 days is an average, not a rule: cycles anywhere from about 21 to 40 days are common, and the same person’s cycles vary from month to month.',
      'It is usually described in four parts. The period itself. The follicular phase, as the body prepares to release an egg. Ovulation, when it does. And the luteal phase, the stretch between ovulation and the next period.',
      'The ring on Today draws your current cycle that way: clay for the period, sage for the fertile window, and a marker for today.',
      SEE_SOMEONE,
    ],
  },
  {
    id: 'phase-period',
    phase: 'period',
    title: 'During your period',
    summary: 'Usually two to seven days. What is common, and what is worth asking about.',
    icon: 'water',
    body: [
      'A period usually lasts between two and seven days, and is often heaviest in the first couple of days. Cramps, tiredness, backache and a low mood are all common.',
      'Heat, gentle movement and over-the-counter pain relief help many people with cramps. Rest counts as something.',
      'Periods that are very heavy — soaking through protection every hour or two, or passing large clots — or that last longer than a week, are worth mentioning to a GP. So is bleeding between periods or after sex.',
      SEE_SOMEONE,
    ],
  },
  {
    id: 'phase-follicular',
    phase: 'follicular',
    title: 'After your period',
    summary: 'The follicular phase, and why energy often lifts.',
    icon: 'sprout-outline',
    body: [
      'The follicular phase starts with your period and runs until ovulation. Oestrogen rises through it, and many people notice their energy and mood lifting in the days after a period ends.',
      'Many — not all. Your own logs are a better guide to how this part of the cycle goes for you than any general description, which is why Insights shows what you logged in each phase rather than what you are supposed to feel.',
      SEE_SOMEONE,
    ],
  },
  {
    id: 'phase-fertile',
    phase: 'fertile',
    title: 'The fertile window',
    summary: 'What the sage days mean — and what they cannot promise.',
    icon: 'leaf',
    body: [
      'Pregnancy is most likely in the few days before ovulation and on the day itself, because sperm can survive for several days. That is the window the calendar shades.',
      'The window here is an estimate from the dates of your periods. It cannot see a cycle that has changed this month, and ovulation does not always fall where an average puts it.',
      'It is not contraception and should not be used as contraception. If you want to avoid pregnancy, a GP or sexual health clinic can talk you through methods that work.',
    ],
  },
  {
    id: 'phase-ovulation',
    phase: 'ovulation',
    title: 'Ovulation',
    summary: 'Roughly two weeks before your next period — an estimate, not a date.',
    icon: 'circle-slice-8',
    body: [
      'Ovulation is when an ovary releases an egg. It usually happens around twelve to sixteen days before the next period begins — which is why it is estimated from your next predicted period rather than counted from your last one.',
      'Some people notice changes around now: discharge that becomes clear and stretchy, like raw egg white, a little one-sided pain, or a change in mood or drive. Logging these over a few months makes your own pattern easier to see.',
      SEE_SOMEONE,
    ],
  },
  {
    id: 'phase-luteal',
    phase: 'luteal',
    title: 'Before your period',
    summary: 'The luteal phase, PMS, and being gentle with yourself.',
    icon: 'weather-night',
    body: [
      'The luteal phase is the time between ovulation and your next period, usually around two weeks. Progesterone rises and then falls if there is no pregnancy, and that fall is what brings on the period.',
      'Premenstrual symptoms — bloating, tender breasts, irritability, low mood, tiredness, cravings — are common in the days beforehand. For some people they are severe enough to get in the way of life; if that is you, it is worth talking to a GP. There is real help for it.',
      SEE_SOMEONE,
    ],
  },
  {
    id: 'logging',
    title: 'Getting the most from logging',
    summary: 'Predictions get better with every period you mark.',
    icon: 'pencil-outline',
    body: [
      'Mark the first day of each period. That single tap is what every prediction is built from. The rest — flow, symptoms, mood, sleep — is optional, and is what makes Insights worth opening.',
      'Predictions start from the cycle length you gave when you set up, and switch to your own average as soon as one full cycle has been logged. A cycle that looks impossibly long, usually from a month nobody logged, is kept in your history but left out of the average.',
      'Missed a day? Log it later from the calendar. Nothing here counts streaks.',
    ],
  },
  {
    id: 'when-to-ask',
    title: 'When to talk to someone',
    summary: 'Changes that are worth a conversation with a GP.',
    icon: 'stethoscope',
    body: [
      'It is worth seeing a GP if your periods change — suddenly heavier, longer, or more irregular than usual — or if they stop and you are not pregnant.',
      'Also if you bleed between periods, after sex, or after the menopause; if your periods last longer than seven days or are very heavy; or if pain is getting in the way of everyday life.',
      'If you think you might be pregnant, most pregnancy tests from a pharmacy can be used from the first day of a missed period.',
      'None of these mean something is wrong. They are reasons to ask.',
    ],
  },
];

export function getArticle(id: string): Article | undefined {
  return ARTICLES.find((article) => article.id === id);
}

export function articleForPhase(phase: Phase | null): Article | undefined {
  if (phase === null) return undefined;
  return ARTICLES.find((article) => article.phase === phase);
}
