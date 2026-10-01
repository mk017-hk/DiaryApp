import type { Letter } from '@/features/letters/letterStore';

import { isSupabaseConfigured, supabase } from './client';
import { AppError, toAppError } from './errors';
import type { SyncContext } from './entries';

/**
 * Letters to yourself, in Postgres.
 *
 * Three calls, each of which exists because the seal makes the ordinary route
 * impossible:
 *
 *   send    — an insert with no `select`, because `insert ... returning`
 *             applies the select policy and the select policy is the seal. The
 *             database cannot name the row it just wrote without unsealing it,
 *             so the id comes from the device.
 *   sealed  — metadata for letters that have not opened, through a function,
 *             because a plain select of them returns nothing at all.
 *   open    — the body, on or after the day, through a function that also
 *             records that it was read.
 */

export interface SealedLetter {
  id: string;
  unlockOn: string;
  createdAt: string;
  hasBody: boolean;
}

export interface OpenedLetter {
  id: string;
  body: string | null;
  unlockOn: string;
  unlockedAt: string | null;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

const noService = (): AppError => new AppError('unknown', 'No account service in this build.');

/**
 * Sends letters whose bodies are still on the phone.
 *
 * Returns the ids the account accepted, which is what lets the device drop the
 * bodies. Nothing comes back about the rows themselves — there is nothing the
 * account is willing to say about them.
 */
export async function sendLetters(
  letters: Letter[],
  context: SyncContext,
): Promise<Result<string[]>> {
  if (letters.length === 0) return { ok: true, value: [] };
  if (!isSupabaseConfigured) return { ok: false, error: noService() };

  try {
    const { error } = await supabase.from('future_messages').insert(
      letters.map((letter) => ({
        id: letter.id,
        diary_id: context.diaryId,
        author_id: context.userId,
        body: letter.body ?? '',
        unlock_on: letter.unlockOn,
      })),
    );

    if (error !== null) return { ok: false, error: toAppError(error, 'send letters') };

    return { ok: true, value: letters.map((letter) => letter.id) };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'send letters') };
  }
}

export async function sealedLetters(): Promise<Result<SealedLetter[]>> {
  if (!isSupabaseConfigured) return { ok: false, error: noService() };

  try {
    const { data, error } = await supabase.rpc('sealed_letters');
    if (error !== null) return { ok: false, error: toAppError(error, 'read sealed letters') };

    const rows = (data ?? []) as {
      id: string;
      unlock_on: string;
      created_at: string;
      has_body: boolean;
    }[];

    return {
      ok: true,
      value: rows.map((row) => ({
        id: row.id,
        unlockOn: row.unlock_on,
        createdAt: row.created_at,
        hasBody: row.has_body,
      })),
    };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'read sealed letters') };
  }
}

/**
 * Opens one, on or after its day.
 *
 * A sealed letter comes back as `null` rather than as an error, because the
 * database declines to distinguish "not yet" from "never existed" — and the
 * screen should not either.
 */
export async function openLetter(id: string): Promise<Result<OpenedLetter | null>> {
  if (!isSupabaseConfigured) return { ok: false, error: noService() };

  try {
    const { data, error } = await supabase.rpc('open_future_message', { message_id: id });
    if (error !== null) return { ok: false, error: toAppError(error, 'open letter') };

    const row = (
      (data ?? []) as {
        id: string;
        body: string | null;
        unlock_on: string;
        unlocked_at: string | null;
      }[]
    )[0];

    if (row === undefined) return { ok: true, value: null };

    return {
      ok: true,
      value: {
        id: row.id,
        body: row.body,
        unlockOn: row.unlock_on,
        unlockedAt: row.unlocked_at,
      },
    };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'open letter') };
  }
}

/**
 * Destroys one without reading it.
 *
 * A function rather than a delete, because Postgres applies select policies to
 * a delete that filters on the row — so an ordinary delete cannot touch a
 * sealed letter at all.
 */
export async function destroyLetter(id: string): Promise<Result<boolean>> {
  if (!isSupabaseConfigured) return { ok: false, error: noService() };

  try {
    const { data, error } = await supabase.rpc('destroy_future_message', { message_id: id });
    if (error !== null) return { ok: false, error: toAppError(error, 'destroy letter') };

    return { ok: true, value: data === true };
  } catch (error) {
    return { ok: false, error: toAppError(error, 'destroy letter') };
  }
}
