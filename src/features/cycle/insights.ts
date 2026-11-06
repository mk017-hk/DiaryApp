import type { Entry } from '@/features/entries';

import { phaseOn, type CycleSummary, type Period, type Phase } from './cycleMath';
import type { DayLog } from './dayLogStore';

/**
 * What her own logs say, arranged by where in the cycle they fell.
 *
 * The one thing a diary and a period tracker can do together that neither can
 * alone: put "anxious" and "couldn't sleep" next to the days before a period,
 * from her own words, and let her see whether the two line up.
 *
 * The same rule as Patterns. This describes and never concludes. It counts
 * what was logged in each phase and shows the most frequent; it does not say
 * that a phase *causes* anything, does not score a cycle, and does not tell her
 * what is normal. With a handful of logs a coincidence looks like a pattern,
 * so nothing is shown for a phase until it has enough days behind it.
 */

export interface Tally {
  id: string;
  count: number;
}

export interface PhaseInsight {
  phase: Phase;
  /** Days in this phase with anything logged or written. */
  days: number;
  symptoms: Tally[];
  /** Emotion slugs, from logs and from entries alike. */
  moods: Tally[];
}

/** Fewer days than this in a phase, and it is not described at all. */
export const MIN_DAYS_FOR_PHASE = 3;

const PHASE_ORDER: Phase[] = ['period', 'follicular', 'fertile', 'ovulation', 'luteal'];

function bump(map: Map<string, number>, id: string): void {
  map.set(id, (map.get(id) ?? 0) + 1);
}

function ranked(map: Map<string, number>, limit: number): Tally[] {
  return [...map.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function byPhase(
  logs: DayLog[],
  entries: Entry[],
  periods: Period[],
  summary: CycleSummary,
  limit = 3,
): PhaseInsight[] {
  const days = new Map<Phase, Set<string>>();
  const symptoms = new Map<Phase, Map<string, number>>();
  const moods = new Map<Phase, Map<string, number>>();

  const place = (date: string): Phase | null => {
    const phase = phaseOn(date, periods, summary);
    if (phase === null) return null;
    if (!days.has(phase)) days.set(phase, new Set());
    days.get(phase)?.add(date);
    return phase;
  };

  for (const log of logs) {
    const phase = place(log.date);
    if (phase === null) continue;
    const symptomMap = symptoms.get(phase) ?? new Map<string, number>();
    const moodMap = moods.get(phase) ?? new Map<string, number>();
    for (const id of log.symptoms) if (id !== 'none') bump(symptomMap, id);
    for (const slug of log.moods) bump(moodMap, slug);
    symptoms.set(phase, symptomMap);
    moods.set(phase, moodMap);
  }

  for (const entry of entries) {
    if (entry.emotions.length === 0) continue;
    const phase = place(entry.entryDate);
    if (phase === null) continue;
    const moodMap = moods.get(phase) ?? new Map<string, number>();
    for (const slug of entry.emotions) bump(moodMap, slug);
    moods.set(phase, moodMap);
  }

  return PHASE_ORDER.flatMap((phase) => {
    const count = days.get(phase)?.size ?? 0;
    if (count < MIN_DAYS_FOR_PHASE) return [];
    return [
      {
        phase,
        days: count,
        symptoms: ranked(symptoms.get(phase) ?? new Map(), limit),
        moods: ranked(moods.get(phase) ?? new Map(), limit),
      },
    ];
  });
}

/** The symptoms logged most often, across everything. */
export function topSymptoms(logs: DayLog[], limit = 5): Tally[] {
  const counts = new Map<string, number>();
  for (const log of logs) for (const id of log.symptoms) if (id !== 'none') bump(counts, id);
  return ranked(counts, limit);
}

/** Sleep and water, averaged over the days they were logged. Null with none. */
export function averages(logs: DayLog[]): { sleep: number | null; water: number | null } {
  const sleep = logs.flatMap((log) => (log.sleepHours === undefined ? [] : [log.sleepHours]));
  const water = logs.flatMap((log) => (log.water === undefined ? [] : [log.water]));
  const avg = (values: number[]) =>
    values.length === 0
      ? null
      : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  return { sleep: avg(sleep), water: avg(water) };
}
