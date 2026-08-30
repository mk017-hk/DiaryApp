import type { TextStyle } from 'react-native';

/**
 * Typography tokens.
 *
 * Two families, each with a job:
 *  - Fraunces (serif) carries emotional moments: dates, prompts, memories.
 *    It is what makes a screen feel like a private book rather than a form.
 *  - Inter (sans) carries interface text: labels, buttons, metadata.
 *
 * Mixing them by role — not by whim — is what holds the whole app together.
 */

export const fontFamily = {
  serifRegular: 'Fraunces_400Regular',
  serifMedium: 'Fraunces_500Medium',
  serifSemiBold: 'Fraunces_600SemiBold',
  serifItalic: 'Fraunces_400Regular_Italic',
  sansRegular: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
} as const;

/**
 * The type scale. Line heights are generous (1.4–1.6) — tight leading reads as
 * dense and busy, which is the opposite of what this app is for.
 */
export const textVariants = {
  /** Reserved for rare, high-emotion moments: onboarding, a resurfaced memory. */
  display: {
    fontFamily: fontFamily.serifRegular,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.6,
  },
  /** Screen titles. */
  title1: {
    fontFamily: fontFamily.serifRegular,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.4,
  },
  /** Section headings, entry titles. */
  title2: {
    fontFamily: fontFamily.serifRegular,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.2,
  },
  /** Smaller serif moments: dates above an entry. */
  title3: {
    fontFamily: fontFamily.serifMedium,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.1,
  },
  /** Journal body text. The most-read style in the app. */
  body: {
    fontFamily: fontFamily.sansRegular,
    fontSize: 17,
    lineHeight: 27,
    letterSpacing: 0,
  },
  /** Body with emphasis. */
  bodyMedium: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 17,
    lineHeight: 27,
    letterSpacing: 0,
  },
  /** Secondary copy, helper text. */
  callout: {
    fontFamily: fontFamily.sansRegular,
    fontSize: 15,
    lineHeight: 23,
    letterSpacing: 0,
  },
  /** Buttons and interactive labels. */
  label: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  /** Metadata: timestamps, counts. */
  caption: {
    fontFamily: fontFamily.sansRegular,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  /** Small all-caps section markers. Use rarely. */
  overline: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof textVariants;

/**
 * Font assets, loaded once at app start.
 * Imported here rather than at call sites so the mapping stays in one place.
 */
export const fontAssets = {
  Fraunces_400Regular: require('@expo-google-fonts/fraunces/400Regular/Fraunces_400Regular.ttf'),
  Fraunces_400Regular_Italic: require('@expo-google-fonts/fraunces/400Regular_Italic/Fraunces_400Regular_Italic.ttf'),
  Fraunces_500Medium: require('@expo-google-fonts/fraunces/500Medium/Fraunces_500Medium.ttf'),
  Fraunces_600SemiBold: require('@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf'),
  Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
} as const;
