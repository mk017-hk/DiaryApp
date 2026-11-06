import type { DayLog } from '@/features/cycle/dayLogStore';

import { isSupabaseConfigured, supabase } from './client';
import type { SyncContext } from './entries';
import { AppError, toAppError } from './errors';

/**
 * Cycle days, to and from the account.
 *
 * Keyed by the person, never by a diary — see the migration for why that is
 * the whole of the privacy model here. `context.diaryId` is not used, on
 * purpose: nothing about a cycle should ever be written with a diary's id.
 */

interface CycleDayRow {
  user_id: string;
  log_date: string;
  period: boolean;
  flow: string | null;
  symptoms: string[];
  moods: string[];
  energy: string | null;
  sleep_hours: number | null;
  water: number | null;
  intimacy: string[];
  discharge: string | null;
  pill: string | null;
  updated_at: string;
  synced_at?: string;
}

const COLUMNS =
  'user_id, log_date, period, flow, symptoms, moods, energy, sleep_hours, water, intimacy, discharge, pill, updated_at, synced_at';

/** Never more than this in one request; a year of logs is well under it. */
const PULL_PAGE = 500;

export function toCycleRow(log: DayLog, userId: string): CycleDayRow {
  return {
    user_id: userId,
    log_date: log.date,
    period: log.period,
    flow: log.flow ?? null,
    symptoms: log.symptoms,
    moods: log.moods,
    energy: log.energy ?? null,
    sleep_hours: log.sleepHours ?? null,
    water: log.water ?? null,
    intimacy: log.intimacy,
    discharge: log.discharge ?? null,
    pill: log.pill ?? null,
    updated_at: log.updatedAt,
  };
}

export function fromCycleRow(row: CycleDayRow): DayLog {
  return {
    date: row.log_date,
    period: row.period,
    ...(row.flow !== null ? { flow: row.flow as NonNullable<DayLog['flow']> } : {}),
    symptoms: row.symptoms as DayLog['symptoms'],
    moods: row.moods,
    ...(row.energy !== null ? { energy: row.energy as NonNullable<DayLog['energy']> } : {}),
    ...(row.sleep_hours !== null ? { sleepHours: Number(row.sleep_hours) } : {}),
    ...(row.water !== null ? { water: row.water } : {}),
    intimacy: row.intimacy as DayLog['intimacy'],
    ...(row.discharge !== null
      ? { discharge: row.discharge as NonNullable<DayLog['discharge']> }
      : {}),
    ...(row.pill !== null ? { pill: row.pill as NonNullable<DayLog['pill']> } : {}),
    // Postgres hands timestamps back in its own format; the app compares
    // them as ISO strings, so normalise before anything is stored.
    updatedAt: new Date(row.updated_at).toISOString(),
    unsynced: false,
  };
}

type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

/**
 * Sends logs, and returns what the account settled on for each day.
 *
 * For a day another phone logged more recently, that is the other phone's
 * version — which is how this one finds out.
 */
export async function pushCycleDays(
  logs: DayLog[],
  context: SyncContext,
): Promise<Result<DayLog[]>> {
  if (logs.length === 0) return { ok: true, value: [] };
  if (!isSupabaseConfigured) {
    return { ok: false, error: new AppError('unknown', 'No account service in this build.') };
  }

  try {
    const { data, error } = await supabase
      .from('cycle_days')
      .upsert(
        logs.map((log) => toCycleRow(log, context.userId)),
        { onConflict: 'user_id,log_date' },
      )
      .select(COLUMNS);

    if (error !== null) return { ok: false, error: toAppError(error, 'push cycle days') };
    return { ok: true, value: ((data ?? []) as CycleDayRow[]).map(fromCycleRow) };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'push cycle days') };
  }
}

/** Everything accepted since the watermark, oldest first, and the new watermark. */
export async function pullCycleDays(
  since: string | null,
): Promise<Result<{ logs: DayLog[]; watermark: string | null }>> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: new AppError('unknown', 'No account service in this build.') };
  }

  try {
    let query = supabase
      .from('cycle_days')
      .select(COLUMNS)
      .order('synced_at', { ascending: true })
      .limit(PULL_PAGE);
    if (since !== null) query = query.gte('synced_at', since);

    const { data, error } = await query;
    if (error !== null) return { ok: false, error: toAppError(error, 'pull cycle days') };

    const rows = (data ?? []) as CycleDayRow[];
    const last = rows[rows.length - 1];
    return {
      ok: true,
      value: { logs: rows.map(fromCycleRow), watermark: last?.synced_at ?? null },
    };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'pull cycle days') };
  }
}

/** Every day, from the account, for "delete my cycle data". */
export async function deleteAllCycleDays(): Promise<Result<null>> {
  if (!isSupabaseConfigured) return { ok: true, value: null };
  try {
    const { error } = await supabase.from('cycle_days').delete().gte('log_date', '1900-01-01');
    if (error !== null) return { ok: false, error: toAppError(error, 'delete cycle days') };
    return { ok: true, value: null };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'delete cycle days') };
  }
}
