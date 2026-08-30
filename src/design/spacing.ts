/**
 * Spacing, radii and sizing tokens.
 *
 * A 4pt base scale. Generous by default — whitespace is the primary tool for
 * calm, and most screens should feel emptier than a productivity app would.
 */

export const space = {
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export type SpaceToken = keyof typeof space;

export const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

export type RadiusToken = keyof typeof radius;

/** Standard horizontal page inset. */
export const screenPadding = space.lg;

export const sizing = {
  /**
   * Minimum interactive size. iOS HIG and WCAG 2.5.5 both land near 44pt;
   * every pressable in the app must meet this, using hitSlop where the visual
   * element is intentionally smaller.
   */
  minTouchTarget: 44,
  controlHeight: 52,
  controlHeightSmall: 40,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
  avatarSm: 32,
  avatarMd: 44,
  avatarLg: 72,
} as const;

/**
 * Elevation is used very sparingly. Warm, wide, low-opacity shadows only —
 * a hard drop shadow immediately reads as a generic card UI.
 */
export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  soft: {
    shadowColor: '#1F1B18',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  lifted: {
    shadowColor: '#1F1B18',
    shadowOpacity: 0.1,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
} as const;

export type ElevationToken = keyof typeof elevation;
