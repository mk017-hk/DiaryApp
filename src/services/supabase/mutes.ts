import type { QuietDates } from '@/features/entries/muteStore';

import { isSupabaseConfigured, supabase } from './client';
import { AppError, toAppError } from './errors';
import type { SyncContext } from './entries';

/**
 * Quiet dates, in Postgres.
 *
 * Simple like threads — a person has a few of these, not thousands, so a full
 * pull costs one small request and removes a class of "which ones did I miss"
 * bug. Unlike threads, a mute can genuinely be lifted, so this half does carry
 * tombstones: the other phone has to be able to learn that a mute is gone, and
 * a missing row is indistinguishable from a row it has not pulled yet.
 */

interface MuteRow {
  id: string;
  diary_id: string;
  created_by: string;
  from_month: number;
  from_day: number;
  to_month: number;
  to_day: number;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export function toMuteRow(mute: QuietDates, context: SyncContext): MuteRow {
  return {
    id: mute.id,
    diary_id: context.diaryId,
    created_by: context.userId,
    from_month: mute.fromMonth,
    from_day: mute.fromDay,
    to_month: mute.toMonth,
    to_day: mute.toDay,
    label: mute.label ?? null,
    created_at: mute.createdAt,
    updated_at: mute.updatedAt,
  };
}

export function fromMuteRow(row: MuteRow): QuietDates {
  const mute: QuietDates = {
    id: row.id,
    fromMonth: row.from_month,
    fromDay: row.from_day,
    toMonth: row.to_month,
    toDay: row.to_day,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    unsynced: false,
  };

  if (row.label !== null) mute.label = row.label;
  return mute;
}

const SELECT =
  'id, diary_id, created_by, from_month, from_day, to_month, to_day, label, created_at, updated_at';

/**
 * Sends mutes, and carries out the lifts.
 *
 * A lifted mute is a delete rather than a flagged row, because unlike an entry
 * there is nothing to keep: the row *is* the restriction, and a restriction
 * that has been lifted is not a record of anything. The device holds its
 * tombstone only long enough to be sure the delete happened.
 */
export async function pushMutes(
  mutes: QuietDates[],
  context: SyncContext,
): Promise<{ ok: true; value: string[] } | { ok: false; error: AppError }> {
  if (mutes.length === 0) return { ok: true, value: [] };
  if (!isSupabaseConfigured) {
    return { ok: false, error: new AppError('unknown', 'No account service in this build.') };
  }

  const lifted = mutes.filter((mute) => mute.deletedAt !== undefined);
  const live = mutes.filter((mute) => mute.deletedAt === undefined);

  try {
    const accepted: string[] = [];

    if (live.length > 0) {
      const { data, error } = await supabase
        .from('resurfacing_mutes')
        .upsert(
          live.map((mute) => toMuteRow(mute, context)),
          { onConflict: 'id' },
        )
        .select('id');

      if (error !== null) return { ok: false, error: toAppError(error, 'push quiet dates') };
      accepted.push(...((data ?? []) as { id: string }[]).map((row) => row.id));
    }

    if (lifted.length > 0) {
      const ids = lifted.map((mute) => mute.id);
      const { error } = await supabase.from('resurfacing_mutes').delete().in('id', ids);

      if (error !== null) return { ok: false, error: toAppError(error, 'lift quiet dates') };
      // A delete that matched nothing has still achieved what it was for.
      accepted.push(...ids);
    }

    return { ok: true, value: accepted };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'push quiet dates') };
  }
}

export async function pullMutes(
  context: SyncContext,
): Promise<{ ok: true; value: QuietDates[] } | { ok: false; error: AppError }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: new AppError('unknown', 'No account service in this build.') };
  }

  try {
    const { data, error } = await supabase
      .from('resurfacing_mutes')
      .select(SELECT)
      .eq('diary_id', context.diaryId);

    if (error !== null) return { ok: false, error: toAppError(error, 'pull quiet dates') };

    return { ok: true, value: ((data ?? []) as unknown as MuteRow[]).map(fromMuteRow) };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'pull quiet dates') };
  }
}
