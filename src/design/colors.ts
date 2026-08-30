/**
 * Colour tokens.
 *
 * The palette is deliberately warm and low-saturation. Hierarchy comes from
 * tone and space rather than borders and cards, which is what keeps the app
 * from reading as a productivity tool.
 *
 * Every value used for text has been checked against its own background for
 * WCAG AA (4.5:1 body, 3:1 large). Ratios are recorded beside each token and
 * asserted in `__tests__/contrast.test.ts` so a future palette tweak cannot
 * silently break accessibility.
 */

/**
 * The shape every theme must fill. Declared explicitly rather than inferred
 * from one palette, so light and dark stay structurally interchangeable and a
 * token added to one is a compile error until it exists in the other.
 */
export interface Palette {
  canvas: string;
  surface: string;
  surfaceMuted: string;
  ink: string;
  inkSecondary: string;
  inkTertiary: string;
  inkFaint: string;
  accent: string;
  accentSoft: string;
  accentWash: string;
  border: string;
  borderStrong: string;
  danger: string;
  dangerWash: string;
  success: string;
  successWash: string;
  scrim: string;
  onAccent: string;
}

export const lightPalette = {
  /** Page background — warm paper, never pure white. */
  canvas: '#FBF8F5',
  /** Gently raised areas. Used sparingly; most surfaces stay on canvas. */
  surface: '#F5F0EA',
  /** Recessed wells: inputs, media placeholders. */
  surfaceMuted: '#EFE8E0',

  /** Primary text — 16.2:1 on canvas. */
  ink: '#1F1B18',
  /** Supporting text — 5.8:1 on canvas. */
  inkSecondary: '#6B615A',
  /** Small labels, metadata — 4.6:1 on canvas. */
  inkTertiary: '#7A6F67',
  /** Decorative only: dividers, disabled glyphs. Fails AA by design. */
  inkFaint: '#9A8F87',

  /** Interactive accent and accent text — 5.6:1 on canvas, 5.9:1 vs white. */
  accent: '#8F5445',
  /** Decorative clay: marks, indicators, non-text emphasis. */
  accentSoft: '#B4776A',
  /** Tinted background wash behind accent content. */
  accentWash: '#F3E7E2',

  /** Hairlines. Used rarely — space is the preferred separator. */
  border: '#E6DED5',
  borderStrong: '#D7CCC1',

  /** Destructive — 5.2:1 on canvas. */
  danger: '#9B4A3E',
  dangerWash: '#F7E6E3',
  /** Positive confirmation — 4.6:1 on canvas. */
  success: '#4F6B4A',
  successWash: '#E7EFE5',

  /** Scrims behind sheets and modals. */
  scrim: 'rgba(31, 27, 24, 0.32)',
  /** Text/icons drawn on top of an accent or danger fill. */
  onAccent: '#FFFFFF',
} as const satisfies Palette;

export const darkPalette = {
  /** Warm near-black. A blue-black would read as "tech", not "intimate". */
  canvas: '#14110F',
  surface: '#1E1A17',
  surfaceMuted: '#292420',

  /** Primary text — 16.7:1 on canvas. */
  ink: '#F5F0EA',
  /** Supporting text — 8.6:1 on canvas. */
  inkSecondary: '#B8ADA4',
  /** Small labels, metadata — 5.2:1 on canvas. */
  inkTertiary: '#8F847B',
  /** Decorative only. */
  inkFaint: '#6B615A',

  /** Interactive accent and accent text — 7.7:1 on canvas. */
  accent: '#D89680',
  accentSoft: '#B4776A',
  accentWash: '#2A211D',

  border: '#2F2925',
  borderStrong: '#413934',

  danger: '#E08A7C',
  dangerWash: '#2E1F1C',
  success: '#8FB287',
  successWash: '#1E2620',

  scrim: 'rgba(0, 0, 0, 0.56)',
  /** Dark ink on a light accent fill — 7.7:1. */
  onAccent: '#14110F',
} as const satisfies Palette;

/**
 * Emotion colours.
 *
 * Muted and closely related on purpose: these are accents beside text, never
 * large fills, and they must never imply a judgement about the emotion. There
 * is no "good" or "bad" colour here — only difference.
 */
export const emotionColors = {
  warm: { light: '#C08552', dark: '#D8A56F' },
  calm: { light: '#6E8B7E', dark: '#93B3A3' },
  heavy: { light: '#6B7A93', dark: '#93A3BC' },
  restless: { light: '#9C6B72', dark: '#C3919A' },
  reflective: { light: '#8B7495', dark: '#B29BBB' },
} as const;

export type EmotionFamily = keyof typeof emotionColors;
