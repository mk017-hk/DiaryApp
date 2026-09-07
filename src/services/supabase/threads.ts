import type { Thread, ThreadStatus } from '@/features/entries/threadStore';

import { isSupabaseConfigured, supabase } from './client';
import { AppError, toAppError } from './errors';
import type { SyncContext } from './entries';

/**
 * Threads, in Postgres.
 *
 * Simpler than entries in two ways, both deliberate. There is no watermark —
 * a person has a handful of threads, not thousands, so a full pull costs one
 * small request and saves an entire class of "which ones did I miss" bug. And
 * there are no tombstones, because threads close rather than disappear.
 */

interface ThreadRow {
  id: string;
  diary_id: string;
  title: string;
  description: string | null;
  status: ThreadStatus;
  is_private: boolean;
  started_on: string;
  created_at: string;
  updated_at: string;
}

export function toThreadRow(thread: Thread, context: SyncContext): ThreadRow {
  return {
    id: thread.id,
    diary_id: context.diaryId,
    title: thread.title,
    description: thread.description ?? null,
    status: thread.status,
    is_private: thread.isPrivate,
    started_on: thread.startedOn,
    created_at: thread.createdAt,
    updated_at: thread.updatedAt,
  };
}

export function fromThreadRow(row: ThreadRow): Thread {
  const thread: Thread = {
    id: row.id,
    title: row.title,
    status: row.status,
    isPrivate: row.is_private,
    startedOn: row.started_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    unsynced: false,
  };

  if (row.description !== null) thread.description = row.description;
  return thread;
}

const SELECT =
  'id, diary_id, title, description, status, is_private, started_on, created_at, updated_at';

export async function pushThreads(
  threads: Thread[],
  context: SyncContext,
): Promise<{ ok: true; value: Thread[] } | { ok: false; error: AppError }> {
  if (threads.length === 0) return { ok: true, value: [] };
  if (!isSupabaseConfigured) {
    return { ok: false, error: new AppError('unknown', 'No account service in this build.') };
  }

  try {
    const { data, error } = await supabase
      .from('threads')
      .upsert(
        threads.map((thread) => toThreadRow(thread, context)),
        { onConflict: 'id' },
      )
      .select(SELECT);

    if (error !== null) return { ok: false, error: toAppError(error, 'push threads') };

    return { ok: true, value: ((data ?? []) as unknown as ThreadRow[]).map(fromThreadRow) };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'push threads') };
  }
}

export async function pullThreads(
  context: SyncContext,
): Promise<{ ok: true; value: Thread[] } | { ok: false; error: AppError }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: new AppError('unknown', 'No account service in this build.') };
  }

  try {
    const { data, error } = await supabase
      .from('threads')
      .select(SELECT)
      .eq('diary_id', context.diaryId)
      .order('started_on', { ascending: false });

    if (error !== null) return { ok: false, error: toAppError(error, 'pull threads') };

    return { ok: true, value: ((data ?? []) as unknown as ThreadRow[]).map(fromThreadRow) };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'pull threads') };
  }
}
