import {
  darkPalette,
  emotionColors,
  lightPalette,
  type EmotionFamily,
  type Palette,
} from './colors';
import { duration, easing, pressScale, spring } from './motion';
import { elevation, radius, screenPadding, sizing, space } from './spacing';
import { fontFamily, textVariants } from './typography';

export type ColorSchemeName = 'light' | 'dark';

export interface Theme {
  scheme: ColorSchemeName;
  colors: Palette;
  emotion: Record<EmotionFamily, string>;
  space: typeof space;
  radius: typeof radius;
  sizing: typeof sizing;
  elevation: typeof elevation;
  screenPadding: number;
  text: typeof textVariants;
  fontFamily: typeof fontFamily;
  motion: {
    duration: typeof duration;
    easing: typeof easing;
    spring: typeof spring;
    pressScale: number;
  };
}

const emotionFor = (scheme: ColorSchemeName): Record<EmotionFamily, string> =>
  Object.fromEntries(
    Object.entries(emotionColors).map(([family, value]) => [family, value[scheme]]),
  ) as Record<EmotionFamily, string>;

const baseTheme = {
  space,
  radius,
  sizing,
  elevation,
  screenPadding,
  text: textVariants,
  fontFamily,
  motion: { duration, easing, spring, pressScale },
} as const;

export const lightTheme: Theme = {
  ...baseTheme,
  scheme: 'light',
  colors: lightPalette,
  emotion: emotionFor('light'),
};

export const darkTheme: Theme = {
  ...baseTheme,
  scheme: 'dark',
  colors: darkPalette,
  emotion: emotionFor('dark'),
};

export const themes: Record<ColorSchemeName, Theme> = {
  light: lightTheme,
  dark: darkTheme,
};
