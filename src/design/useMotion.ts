import { useReducedMotion } from 'react-native-reanimated';

import { duration } from './motion';

/**
 * Motion helpers that honour the OS "Reduce Motion" setting.
 *
 * Reduced motion does not mean "no feedback" — it means no travel. State still
 * changes, it just arrives without movement, so the interface stays legible for
 * people who find animation disorienting or nauseating.
 */
export function useMotion() {
  const reduced = useReducedMotion();

  return {
    reduced,
    /** Collapses any duration to 0 when reduced motion is on. */
    duration: (value: number): number => (reduced ? 0 : value),
    /** Skip transform-based entrances entirely; cross-fade instead. */
    shouldAnimateTransforms: !reduced,
    durations: duration,
  };
}
