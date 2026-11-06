/**
 * Questions to write from, grouped by what kind of day it is.
 *
 * The assistant's own question is drawn from her diary and needs a connection
 * and her consent. These need neither. They are here for the evening when the
 * page is blank and "how was today?" is not the question.
 *
 * Every one is open — none can be answered yes or no — and none presumes how
 * she feels. "What was hard today?" assumes something was; "Was anything hard
 * today?" does not.
 */

export interface PromptSet {
  id: string;
  title: string;
  icon: string;
  prompts: string[];
}

export const PROMPT_SETS: PromptSet[] = [
  {
    id: 'today',
    title: 'Just today',
    icon: 'white-balance-sunny',
    prompts: [
      'What is one thing from today you would like to remember in a year?',
      'Where were you when you felt most like yourself today?',
      'What did today ask of you?',
      'If today had a title, what would it be?',
    ],
  },
  {
    id: 'hard',
    title: 'A hard day',
    icon: 'weather-pouring',
    prompts: [
      'Was anything heavier than it looked from the outside?',
      'What would you say to a friend who had the day you just had?',
      'What helped, even a little?',
      'What do you need tomorrow that you did not have today?',
    ],
  },
  {
    id: 'grateful',
    title: 'Small good things',
    icon: 'flower-outline',
    prompts: [
      'Was there a moment today you did not want to end?',
      'Who made something easier for you lately?',
      'What is something ordinary you would miss if it were gone?',
    ],
  },
  {
    id: 'people',
    title: 'People',
    icon: 'account-heart-outline',
    prompts: [
      'Who have you been thinking about, and why now?',
      'What is a conversation you keep replaying?',
      'Who would you like to know you better?',
    ],
  },
  {
    id: 'body',
    title: 'Body and cycle',
    icon: 'sync',
    prompts: [
      'How has your body felt this week — not how it looked?',
      'Is there anything you notice about yourself at this point in your cycle?',
      'What does rest look like for you right now?',
    ],
  },
  {
    id: 'change',
    title: 'Looking back',
    icon: 'history',
    prompts: [
      'What do you know now that you did not know a year ago?',
      'What are you proud of that nobody else would notice?',
      'What are you ready to stop carrying?',
    ],
  },
];
