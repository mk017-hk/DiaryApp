import type { Entry } from '@/features/entries/entryStore';

import { isSupabaseConfigured, supabase } from './client';
import { AppError, toAppError } from './errors';

/**
 * Entries, in Postgres.
 *
 * The counterpart to the device store, not a replacement for it. Screens never
 * call this — the sync engine does, in both directions, and the device stays
 * the thing you read from.
 *
 * Everything here is written so that being offline is ordinary rather than
 * exceptional: a push carries the time the edit was made, not the time it
 * arrived, and the database decides who wins. See the trigger in
 * `20260907000001_entry_sync.sql`.
 */

export interface SyncContext {
  diaryId: string;
  userId: string;
}

/** A row of `journal_entries`, as the columns this app writes and reads. */
interface EntryRow {
  id: string;
  diary_id: string;
  author_id: string;
  body: string | null;
  entry_date: string;
  entry_at: string;
  mood: number | null;
  is_favourite: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/**
 * A device entry as a row.
 *
 * `updated_at` is sent deliberately. It is the whole basis of conflict
 * resolution: it says when this edit was made, which on a phone that has been
 * in a tunnel for an hour is not remotely the same as now.
 *
 * Columns this app does not own — `thread_id`, `title`, `people` — are left
 * out rather than sent as null. PostgREST only updates the columns present, so
 * omitting them preserves whatever else has set them.
 */
export function toRow(
  entry: Entry,
  context: SyncContext,
): Omit<EntryRow, 'diary_id'> & {
  diary_id: string;
} {
  return {
    id: entry.id,
    diary_id: context.diaryId,
    author_id: context.userId,
    body: entry.body,
    entry_date: entry.entryDate,
    entry_at: entry.entryAt,
    mood: entry.mood,
    is_favourite: entry.isFavourite,
    deleted_at: entry.deletedAt ?? null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

/**
 * A row as a device entry.
 *
 * Media is not here. `videoUri` and `posterUri` point at files on one
 * particular phone and mean nothing on another, so they are never sent and
 * never overwritten by a pull — the media module deals in storage paths
 * instead, and a device that has the file keeps using the file.
 */
export function fromRow(row: EntryRow): Entry {
  const entry: Entry = {
    id: row.id,
    entryDate: row.entry_date,
    entryAt: row.entry_at,
    body: row.body ?? '',
    mood: row.mood,
    emotions: [],
    isFavourite: row.is_favourite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    unsynced: false,
  };

  if (row.deleted_at !== null) entry.deletedAt = row.deleted_at;
  return entry;
}

const SELECT =
  'id, diary_id, author_id, body, entry_date, entry_at, mood, is_favourite, deleted_at, created_at, updated_at';

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

export interface PushOutcome {
  /** What the server holds now, for every row we sent. Adopt these locally. */
  accepted: Entry[];
  /** Ids the server confirmed as deleted. Safe to drop from the device. */
  deleted: string[];
}

/**
 * Sends local changes.
 *
 * One upsert for everything, tombstones included — a row deleted before it was
 * ever pushed is just an insert that arrives already deleted, which saves
 * having to care whether the server has seen it before.
 *
 * What comes back is the state after the database applied its own rules, so a
 * push that lost to a newer edit returns the winner rather than an error. The
 * caller writes that straight back to the device, and both ends agree without
 * a second round trip.
 */
export async function pushEntries(
  entries: Entry[],
  context: SyncContext,
): Promise<{ ok: true; value: PushOutcome } | { ok: false; error: AppError }> {
  if (entries.length === 0) return { ok: true, value: { accepted: [], deleted: [] } };
  if (!isSupabaseConfigured) {
    return { ok: false, error: new AppError('unknown', 'No account service in this build.') };
  }

  try {
    const { data, error } = await supabase
      .from('journal_entries')
      .upsert(
        entries.map((entry) => toRow(entry, context)),
        { onConflict: 'id' },
      )
      .select(SELECT);

    if (error !== null) return { ok: false, error: toAppError(error, 'push entries') };

    const rows = (data ?? []) as unknown as EntryRow[];
    const accepted = rows.map(fromRow);

    return {
      ok: true,
      value: {
        accepted,
        deleted: accepted.filter((entry) => entry.deletedAt !== undefined).map((entry) => entry.id),
      },
    };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'push entries') };
  }
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

export interface PullOutcome {
  entries: Entry[];
  /**
   * The newest `updated_at` seen, to ask from next time.
   *
   * Taken from the rows rather than the device clock on purpose: a phone whose
   * clock is a few minutes fast would otherwise set a watermark in the future
   * and skip everything written in between.
   */
  watermark: string | null;
}

/**
 * Fetches everything in the diary touched since `since`.
 *
 * Deleted rows are included — a tombstone is the only way a second device
 * learns that something was deleted, and filtering them out here is how you
 * end up with an entry that will not stay deleted.
 *
 * The bound is inclusive, so the row that set the last watermark comes back
 * again. Re-applying an identical row costs nothing, and an exclusive bound
 * would silently drop anything written in the same millisecond.
 */
export async function pullEntries(
  since: string | null,
  context: SyncContext,
  limit = 500,
): Promise<{ ok: true; value: PullOutcome } | { ok: false; error: AppError }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: new AppError('unknown', 'No account service in this build.') };
  }

  try {
    let query = supabase
      .from('journal_entries')
      .select(SELECT)
      .eq('diary_id', context.diaryId)
      .order('updated_at', { ascending: true })
      .limit(limit);

    if (since !== null) query = query.gte('updated_at', since);

    const { data, error } = await query;
    if (error !== null) return { ok: false, error: toAppError(error, 'pull entries') };

    const rows = (data ?? []) as unknown as EntryRow[];
    const entries = rows.map(fromRow);
    const watermark = rows.length === 0 ? null : (rows[rows.length - 1]?.updated_at ?? null);

    return { ok: true, value: { entries, watermark } };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'pull entries') };
  }
}

// ---------------------------------------------------------------------------
// Which diary
// ---------------------------------------------------------------------------

/**
 * The signed-in user's personal diary.
 *
 * Created by the `handle_new_user` trigger at sign-up, so it exists before the
 * app ever asks. RLS means this can only ever return diaries the caller is a
 * member of, so there is nothing to check here that the database has not.
 */
export async function personalDiaryId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase
      .from('diaries')
      .select('id')
      .eq('kind', 'personal')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error !== null) {
      toAppError(error, 'find diary');
      return null;
    }

    return data?.[0]?.id ?? null;
  } catch (error) {
    toAppError(error, 'find diary');
    return null;
  }
}
