import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '@/services/logger';

import { DEFAULT_CYCLE_SETTINGS, type CycleSettings } from './cycleMath';
import {
  flowMeansPeriod,
  type DischargeId,
  type EnergyId,
  type FlowId,
  type IntimacyId,
  type PillId,
  type SymptomId,
} from './vocabulary';

/**
 * The daily log, on the device.
 *
 * One record per day, keyed by the day. Separate from entries on purpose: an
 * entry is something she wrote, and a log is a handful of taps about how her
 * body was. They answer different questions, they are shown in different
 * places, and — the reason that decides it — they are shared differently. A
 * diary can be shared with somebody; cycle data never is. Keeping the two in
 * separate stores makes that a matter of where things live rather than a
 * filter somebody could forget.
 *
 * Local-first like everything else: written here, pushed afterwards.
 */

const DAYS_KEY = 'cycle.days.v1';
const SETTINGS_KEY = 'cycle.settings.v1';

export interface DayLog {
  /** 'YYYY-MM-DD'. Also the record's key. */
  date: string;
  /** A period day. Set by marking the period, or by logging a flow. */
  period: boolean;
  flow?: FlowId;
  symptoms: SymptomId[];
  /** Emotion slugs, from the same vocabulary entries use. */
  moods: string[];
  energy?: EnergyId;
  /** Hours, to the half hour. */
  sleepHours?: number;
  /** Glasses. */
  water?: number;
  intimacy: IntimacyId[];
  discharge?: DischargeId;
  pill?: PillId;
  updatedAt: string;
  /** Carries changes the account has not accepted yet. */
  unsynced?: boolean;
}

/** A field set to undefined is cleared. */
export type DayLogChanges = {
  [K in keyof Omit<DayLog, 'date' | 'updatedAt' | 'unsynced'>]?: DayLog[K] | undefined;
};

export function emptyLog(date: string): DayLog {
  return { date, period: false, symptoms: [], moods: [], intimacy: [], updatedAt: '' };
}

/** Whether a log says anything at all. An empty one is the same as none. */
export function isEmptyLog(log: DayLog): boolean {
  return (
    !log.period &&
    log.flow === undefined &&
    log.symptoms.length === 0 &&
    log.moods.length === 0 &&
    log.energy === undefined &&
    log.sleepHours === undefined &&
    log.water === undefined &&
    log.intimacy.length === 0 &&
    log.discharge === undefined &&
    log.pill === undefined
  );
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToDayLogs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      logger.error('Day log listener failed', { error });
    }
  }
}

/**
 * Writes are serialised.
 *
 * Every write is read-modify-write over one key, and two taps in quick
 * succession on the log screen would otherwise each read the same starting
 * state and the second would silently undo the first.
 */
let queue: Promise<unknown> = Promise.resolve();
function serialised<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

async function readAll(): Promise<Record<string, DayLog>> {
  try {
    const raw = await AsyncStorage.getItem(DAYS_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, DayLog>;
  } catch (error) {
    logger.error('Could not read day logs', { error });
    return {};
  }
}

async function writeAll(logs: Record<string, DayLog>): Promise<void> {
  await AsyncStorage.setItem(DAYS_KEY, JSON.stringify(logs));
  notify();
}

/** Every day with something logged, oldest first. */
export async function listDayLogs(): Promise<DayLog[]> {
  const all = await readAll();
  return Object.values(all)
    .filter((log) => !isEmptyLog(log))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getDayLog(date: string): Promise<DayLog> {
  const all = await readAll();
  return all[date] ?? emptyLog(date);
}

/** Every day marked as a period day. */
export async function periodDays(): Promise<Set<string>> {
  const logs = await listDayLogs();
  return new Set(logs.filter((log) => log.period).map((log) => log.date));
}

function applyChanges(current: DayLog, changes: DayLogChanges, now: string): DayLog {
  // Undefined in a patch means "clear it". An optional field present but
  // undefined would vanish in JSON anyway, but not before it had confused a
  // comparison, so it is removed properly. Required fields fall back to empty.
  const merged: Record<string, unknown> = { ...current, updatedAt: now, unsynced: true };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  const next = { ...emptyLog(current.date), ...merged } as DayLog;

  // Logging a flow is marking a period day. Clearing the period clears the
  // flow with it, except spotting, which is not a period.
  if ('flow' in changes && flowMeansPeriod(changes.flow)) next.period = true;
  if ('period' in changes && changes.period === false && flowMeansPeriod(next.flow)) {
    delete next.flow;
  }

  // "Nothing to note" and a symptom are contradictory; the newest tap wins.
  if (changes.symptoms !== undefined && changes.symptoms.length > 1) {
    const lastTapped = changes.symptoms[changes.symptoms.length - 1];
    next.symptoms =
      lastTapped === 'none' ? ['none'] : changes.symptoms.filter((id) => id !== 'none');
  }
  if (changes.intimacy !== undefined && changes.intimacy.length > 1) {
    const lastTapped = changes.intimacy[changes.intimacy.length - 1];
    next.intimacy =
      lastTapped === 'none' ? ['none'] : changes.intimacy.filter((id) => id !== 'none');
  }

  return next;
}

export function saveDayLog(date: string, changes: DayLogChanges): Promise<DayLog> {
  return serialised(async () => {
    const all = await readAll();
    const next = applyChanges(all[date] ?? emptyLog(date), changes, new Date().toISOString());
    all[date] = next;
    await writeAll(all);
    return next;
  });
}

/**
 * Marks and unmarks period days in one write.
 *
 * What the calendar's "edit period" mode saves: a handful of taps on separate
 * days, applied together so the predictions recompute once.
 */
export function setPeriodDays(changes: { on: string[]; off: string[] }): Promise<void> {
  return serialised(async () => {
    const all = await readAll();
    const now = new Date().toISOString();
    for (const date of changes.on) {
      all[date] = applyChanges(all[date] ?? emptyLog(date), { period: true }, now);
    }
    for (const date of changes.off) {
      if (all[date] === undefined) continue;
      all[date] = applyChanges(all[date], { period: false }, now);
    }
    await writeAll(all);
  });
}

// --- sync ---------------------------------------------------------------

/** Logs the account has not accepted yet, empty ones included: an emptied
 *  day has to reach the account as empty, or the old one comes back. */
export async function unsyncedDayLogs(): Promise<DayLog[]> {
  const all = await readAll();
  return Object.values(all).filter((log) => log.unsynced !== false);
}

/** Records that these versions reached the account. A newer edit stays unsynced. */
export function markDayLogsSynced(sent: { date: string; updatedAt: string }[]): Promise<void> {
  return serialised(async () => {
    const all = await readAll();
    for (const { date, updatedAt } of sent) {
      const current = all[date];
      if (current?.updatedAt === updatedAt) all[date] = { ...current, unsynced: false };
    }
    await writeAll(all);
  });
}

/**
 * Takes the account's version of each day, unless this phone's is newer.
 *
 * Last write wins, by when the day was logged rather than when it arrived —
 * the same rule entries follow.
 */
export function applyRemoteDayLogs(remote: DayLog[]): Promise<number> {
  return serialised(async () => {
    const all = await readAll();
    let changed = 0;
    for (const log of remote) {
      const current = all[log.date];
      if (current !== undefined && current.updatedAt >= log.updatedAt) continue;
      all[log.date] = { ...log, unsynced: false };
      changed += 1;
    }
    if (changed > 0) await writeAll(all);
    return changed;
  });
}

export async function clearDayLogs(): Promise<void> {
  await AsyncStorage.removeItem(DAYS_KEY);
  notify();
}

// --- settings -----------------------------------------------------------

export async function loadCycleSettings(): Promise<CycleSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw === null) return DEFAULT_CYCLE_SETTINGS;
    return { ...DEFAULT_CYCLE_SETTINGS, ...(JSON.parse(raw) as Partial<CycleSettings>) };
  } catch (error) {
    logger.error('Could not read cycle settings', { error });
    return DEFAULT_CYCLE_SETTINGS;
  }
}

export async function saveCycleSettings(changes: Partial<CycleSettings>): Promise<CycleSettings> {
  const next = { ...(await loadCycleSettings()), ...changes };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  notify();
  return next;
}

export async function clearCycleSettings(): Promise<void> {
  await AsyncStorage.removeItem(SETTINGS_KEY);
  notify();
}
