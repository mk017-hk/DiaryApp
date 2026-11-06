import * as Crypto from 'expo-crypto';

import type { Entry } from '@/features/entries/entryStore';

import { isSupabaseConfigured, supabase } from './client';
import { emotionIndex, replaceEntryEmotions } from './emotions';
import { COLUMNS, fromRow, toRow } from './entries';
import { AppError, toAppError } from './errors';

/**
 * A diary somebody else shared with you, read and written live.
 *
 * Not local-first, and on purpose. Your own diary is copied to the phone so
 * capture never waits on a signal. A diary that belongs to someone else is
 * theirs: copying it onto your phone would put their words somewhere they did
 * not choose, beyond the reach of their deleting an entry or ending the share.
 * So it is read from the account each time it is opened, through the same Row
 * Level Security that decides what a member may see — entries the author kept
 * "just for me" are never returned at all — and nothing of it is stored here.
 *
 * Writing into it is a direct insert as yourself. The database checks that you
 * are a member and that the author is you.
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export interface SharedEntry extends Entry {
  authorId: string;
}

const PAGE = 50;

const SELECT = `${COLUMNS}, entry_media(id, kind, storage_path, poster_path, duration_ms, status, position), entry_emotions(emotion_id)`;

const noService = () => new AppError('unknown', 'No account service in this build.');

/** The newest entries first, `before` an entry time for the next page. */
export async function readSharedDiary(
  diaryId: string,
  before?: string,
): Promise<Result<SharedEntry[]>> {
  if (!isSupabaseConfigured) return { ok: false, error: noService() };

  try {
    let query = supabase
      .from('journal_entries')
      .select(SELECT)
      .eq('diary_id', diaryId)
      .is('deleted_at', null)
      .order('entry_at', { ascending: false })
      .limit(PAGE);
    if (before !== undefined) query = query.lt('entry_at', before);

    const { data, error } = await query;
    if (error !== null) return { ok: false, error: toAppError(error, 'read shared diary') };

    const { slugById } = await emotionIndex();
    const rows = (data ?? []) as unknown as (Parameters<typeof fromRow>[0] & {
      author_id: string;
    })[];
    return {
      ok: true,
      value: rows.map((row) => ({ ...fromRow(row, slugById), authorId: row.author_id })),
    };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'read shared diary') };
  }
}

export interface SharedDraft {
  body: string;
  mood: number | null;
  emotions: string[];
  /** Readable only by you, even inside their diary. */
  isPersonal: boolean;
}

export async function writeToSharedDiary(
  diaryId: string,
  userId: string,
  draft: SharedDraft,
): Promise<Result<SharedEntry>> {
  if (!isSupabaseConfigured) return { ok: false, error: noService() };

  const now = new Date();
  const key = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const entry: Entry = {
    id: Crypto.randomUUID(),
    entryDate: key,
    entryAt: now.toISOString(),
    body: draft.body.trim(),
    mood: draft.mood,
    emotions: draft.emotions,
    media: [],
    isFavourite: false,
    ...(draft.isPersonal ? { isPersonal: true } : {}),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('journal_entries')
      .insert(toRow(entry, { diaryId, userId }))
      .select(COLUMNS)
      .single();
    if (error !== null) return { ok: false, error: toAppError(error, 'write to shared diary') };

    if (draft.emotions.length > 0) {
      await replaceEntryEmotions([{ id: entry.id, emotions: draft.emotions }], diaryId);
    }

    const row = data as unknown as Parameters<typeof fromRow>[0] & { author_id: string };
    return {
      ok: true,
      value: { ...fromRow(row), emotions: draft.emotions, authorId: row.author_id },
    };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'write to shared diary') };
  }
}

/** Your own entry in their diary, removed. Only the author can. */
export async function deleteFromSharedDiary(entryId: string): Promise<Result<null>> {
  if (!isSupabaseConfigured) return { ok: false, error: noService() };
  try {
    const { error } = await supabase
      .from('journal_entries')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', entryId);
    if (error !== null) return { ok: false, error: toAppError(error, 'delete shared entry') };
    return { ok: true, value: null };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'delete shared entry') };
  }
}
