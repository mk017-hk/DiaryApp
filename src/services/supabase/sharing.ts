import { isSupabaseConfigured, supabase } from './client';
import { AppError, toAppError } from './errors';

/**
 * Sharing a diary, from the client's side.
 *
 * Thin on purpose. Every decision that matters — who may invite, what a code is
 * worth, who may join, what happens when somebody leaves — is in SQL, because
 * a `diary_members` row is the one write in this schema that hands somebody
 * everything. This file calls four functions and does no checking of its own,
 * which is the point: there is nothing here to get wrong, and nothing here that
 * a modified client could skip.
 */

export interface DiaryMember {
  userId: string;
  displayName: string | null;
  role: 'owner' | 'member';
  joinedAt: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

const noService = (): AppError => new AppError('unknown', 'No account service in this build.');

/**
 * Makes an invitation and returns the code.
 *
 * The only moment the code exists in the clear — the account keeps a hash of
 * it. If she loses it before passing it on, the answer is a new invitation
 * rather than a lookup, and that is the correct answer.
 */
export async function createInvite(diaryId: string, validDays = 7): Promise<Result<string>> {
  if (!isSupabaseConfigured) return { ok: false, error: noService() };

  try {
    const { data, error } = await supabase.rpc('create_diary_invite', {
      target_diary: diaryId,
      valid_days: validDays,
    });

    if (error !== null) return { ok: false, error: toAppError(error, 'create invite') };
    return { ok: true, value: data as string };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'create invite') };
  }
}

/**
 * Joins a diary with a code.
 *
 * Every way of being refused comes back with the same message, deliberately, so
 * the screen cannot accidentally turn into an oracle for which codes exist by
 * repeating what the server said in different words.
 */
export async function acceptInvite(code: string): Promise<Result<string>> {
  if (!isSupabaseConfigured) return { ok: false, error: noService() };

  try {
    const { data, error } = await supabase.rpc('accept_diary_invite', { code });

    if (error !== null) {
      return {
        ok: false,
        error: new AppError('validation', 'That invitation is not valid. Ask for a new one.'),
      };
    }

    return { ok: true, value: data as string };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'accept invite') };
  }
}

export async function diaryMembers(diaryId: string): Promise<Result<DiaryMember[]>> {
  if (!isSupabaseConfigured) return { ok: false, error: noService() };

  try {
    const { data, error } = await supabase.rpc('diary_members_with_names', {
      target_diary: diaryId,
    });

    if (error !== null) return { ok: false, error: toAppError(error, 'read members') };

    const rows = (data ?? []) as {
      user_id: string;
      display_name: string | null;
      role: 'owner' | 'member';
      joined_at: string;
    }[];

    return {
      ok: true,
      value: rows.map((row) => ({
        userId: row.user_id,
        displayName: row.display_name,
        role: row.role,
        joinedAt: row.joined_at,
      })),
    };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'read members') };
  }
}

/** Leaves a shared diary. Entries stay where they were written. */
export async function leaveDiary(diaryId: string): Promise<Result<boolean>> {
  if (!isSupabaseConfigured) return { ok: false, error: noService() };

  try {
    const { data, error } = await supabase.rpc('leave_diary', { target_diary: diaryId });

    if (error !== null) return { ok: false, error: toAppError(error, 'leave diary') };
    return { ok: true, value: data === true };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'leave diary') };
  }
}

/** Every diary this account can reach, with whether it is shared. */
export async function myDiaries(): Promise<
  Result<{ id: string; title: string; kind: 'personal' | 'shared'; ownerId: string }[]>
> {
  if (!isSupabaseConfigured) return { ok: false, error: noService() };

  try {
    const { data, error } = await supabase
      .from('diaries')
      .select('id, title, kind, owner_id')
      .order('created_at');

    if (error !== null) return { ok: false, error: toAppError(error, 'read diaries') };

    const rows = (data ?? []) as {
      id: string;
      title: string;
      kind: 'personal' | 'shared';
      owner_id: string;
    }[];

    return {
      ok: true,
      value: rows.map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        ownerId: row.owner_id,
      })),
    };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'read diaries') };
  }
}
