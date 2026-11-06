import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme, type Palette } from '@/design';
import { addDays, daysBetween } from '@/lib/date';

export interface RingSegment {
  /** Cycle days, 1-based and inclusive. */
  from: number;
  to: number;
  color: keyof Palette;
}

export interface CycleRingProps {
  size: number;
  /** Days around the ring. */
  total: number;
  segments: RingSegment[];
  /** Where today is, as a cycle day. Omitted when there is no cycle to place it on. */
  marker?: number;
  children: ReactNode;
}

const STROKE = 10;
const GAP = 8;

function point(cx: number, cy: number, r: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) };
}

function arc(cx: number, cy: number, r: number, start: number, end: number): string {
  // A full circle cannot be drawn as one arc; stop a hair short.
  const sweep = Math.min(end - start, 359.99);
  const a = point(cx, cy, r, start);
  const b = point(cx, cy, r, start + sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/**
 * Today's circle: the cycle as a ring, with the day's words in the middle.
 *
 * The ring is a map of the cycle — clay where the period falls, sage across the
 * fertile window — and a marker where today sits on it. The middle is a warm
 * gradient disc, and whatever Today puts inside it.
 *
 * The ring is decoration for the eye; everything it shows is also said in words
 * inside the circle, so it is hidden from screen readers.
 */
export function CycleRing({ size, total, segments, marker, children }: CycleRingProps) {
  const theme = useTheme();
  const c = size / 2;
  const r = c - STROKE / 2;
  const perDay = 360 / Math.max(total, 1);
  const angleOf = (day: number) => -90 + (day - 1) * perDay;
  const inner = size - 2 * (STROKE + GAP);

  const markerAt =
    marker !== undefined ? point(c, c, r, angleOf(Math.min(marker, total)) + perDay / 2) : null;

  return (
    <View style={{ height: size, width: size }}>
      <View
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg width={size} height={size}>
          <Circle
            cx={c}
            cy={c}
            r={r}
            stroke={theme.colors.border}
            strokeWidth={STROKE}
            fill="none"
          />
          {segments.map((segment) => (
            <Path
              key={`${segment.color}-${String(segment.from)}`}
              d={arc(c, c, r, angleOf(segment.from), angleOf(segment.to + 1))}
              stroke={theme.colors[segment.color]}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
            />
          ))}
          {markerAt !== null && (
            <Circle
              cx={markerAt.x}
              cy={markerAt.y}
              r={STROKE}
              fill={theme.colors.card}
              stroke={theme.colors.ink}
              strokeWidth={3}
            />
          )}
        </Svg>
      </View>

      <LinearGradient
        colors={[theme.colors.heroFrom, theme.colors.heroTo]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[
          styles.disc,
          {
            borderRadius: inner / 2,
            height: inner,
            left: STROKE + GAP,
            top: STROKE + GAP,
            width: inner,
          },
        ]}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    position: 'absolute',
  },
});

/**
 * The current cycle, as ring segments.
 *
 * Needs the cycle day and the window from `cycleOn`, and draws the period at
 * its logged length when that is longer than the usual one.
 */
export function segmentsFor(
  today: string,
  now: {
    dayOfCycle: number | null;
    fertile: { start: string; end: string } | null;
    ovulation: string | null;
  },
  periodLength: number,
  total: number,
): RingSegment[] {
  if (now.dayOfCycle === null) return [];
  const start = addDays(today, -(now.dayOfCycle - 1));
  const dayOf = (date: string) => daysBetween(start, date) + 1;
  const segments: RingSegment[] = [{ from: 1, to: Math.min(periodLength, total), color: 'period' }];
  if (now.fertile !== null) {
    const from = Math.max(dayOf(now.fertile.start), periodLength + 1);
    const to = Math.min(dayOf(now.fertile.end), total);
    if (from <= to) segments.push({ from, to, color: 'fertile' });
  }
  if (now.ovulation !== null) {
    const day = dayOf(now.ovulation);
    if (day >= 1 && day <= total) segments.push({ from: day, to: day, color: 'ovulation' });
  }
  return segments;
}
