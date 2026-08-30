import { darkPalette, lightPalette, type Palette } from '../colors';

/**
 * Guards the accessibility claims made in `colors.ts`.
 *
 * A palette tweak that quietly drops body text below 4.5:1 is the kind of
 * regression nobody notices until a user with low vision cannot read their own
 * journal. These assertions make that a failing test instead.
 */

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const normalised = hex.replace('#', '');
  const r = Number.parseInt(normalised.slice(0, 2), 16);
  const g = Number.parseInt(normalised.slice(2, 4), 16);
  const b = Number.parseInt(normalised.slice(4, 6), 16);

  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);

  return (lighter + 0.05) / (darker + 0.05);
}

const AA_BODY = 4.5;
const AA_LARGE = 3;

const palettes: [string, Palette][] = [
  ['light', lightPalette],
  ['dark', darkPalette],
];

describe.each(palettes)('%s palette', (_name, palette) => {
  it.each([
    ['ink'],
    ['inkSecondary'],
    ['inkTertiary'],
    ['accent'],
    ['danger'],
    ['success'],
  ] as const)('%s meets AA for body text on canvas', (token) => {
    expect(contrastRatio(palette[token], palette.canvas)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('keeps secondary text readable on raised surfaces', () => {
    expect(contrastRatio(palette.inkSecondary, palette.surface)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('keeps primary text readable in recessed wells', () => {
    expect(contrastRatio(palette.ink, palette.surfaceMuted)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('renders button labels legibly on an accent fill', () => {
    expect(contrastRatio(palette.onAccent, palette.accent)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('keeps decorative accent marks distinguishable from the canvas', () => {
    expect(contrastRatio(palette.accentSoft, palette.canvas)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});
