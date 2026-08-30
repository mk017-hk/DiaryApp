import { Easing } from 'react-native-reanimated';

/**
 * Motion tokens.
 *
 * Movement here should feel like paper settling, not like a UI reacting.
 * Springs are damped enough that nothing overshoots or wobbles — bounce reads
 * as playful, and this app is calm.
 *
 * Every animation must be gated on `useReducedMotion` (see `useMotion`).
 */

export const duration = {
  /** Press feedback, colour changes. */
  instant: 120,
  /** Most transitions. */
  quick: 200,
  /** Screen and sheet transitions. */
  standard: 280,
  /** Deliberate, emotional reveals — a resurfaced memory appearing. */
  slow: 420,
} as const;

export const easing = {
  /** Default for anything entering the screen. */
  entrance: Easing.bezier(0.16, 1, 0.3, 1),
  /** Default for anything leaving. */
  exit: Easing.bezier(0.7, 0, 0.84, 0),
  /** Symmetric moves. */
  standard: Easing.bezier(0.4, 0, 0.2, 1),
} as const;

export const spring = {
  /** General-purpose, no overshoot. */
  gentle: { damping: 20, stiffness: 180, mass: 1 },
  /** Sheets and larger surfaces. */
  soft: { damping: 24, stiffness: 140, mass: 1 },
  /** Small, responsive elements: chips, toggles. */
  snappy: { damping: 18, stiffness: 260, mass: 0.8 },
} as const;

/** Scale applied while a control is held down. */
export const pressScale = 0.97;
