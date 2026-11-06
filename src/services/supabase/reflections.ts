import { isSupabaseConfigured, supabase } from './client';
import { toAppError } from './errors';

/**
 * Reflections, from the app's side.
 *
 * The rules about what may be read live in SQL and the model call lives in the
 * `reflect` function; this asks for one, reads them back, and deletes them.
 */

export type SuggestionKind = 'write' | 'try' | 'keep';

export interface Reflection {
  id: string;
  entryId: string;
  notes: string;
  themes: string[];
  feelings: string[];
  suggestions: { kind: SuggestionKind; text: string }[];
  createdAt: string;
}

export type UnavailableReason =
  | 'not_allowed'
  | 'nothing_to_read'
  | 'no_model_configured'
  | 'daily_limit'
  | 'declined'
  | 'withheld'
  | 'busy'
  | 'model_error'
  | 'offline';

export type ReflectOutcome =
  | { kind: 'reflection'; reflection: Reflection }
  | { kind: 'support' }
  | { kind: 'unavailable'; reason: UnavailableReason };

/** Worth trying again later. Everything else is an answer, not a hiccup. */
export function isTransient(reason: UnavailableReason): boolean {
  return reason === 'busy' || reason === 'model_error' || reason === 'offline';
}

interface Row {
  id: string;
  entry_id: string;
  notes: string;
  themes: string[] | null;
  feelings: string[] | null;
  suggestions: unknown;
  created_at: string;
}

function fromRow(row: Row): Reflection {
  const suggestions = (Array.isArray(row.suggestions) ? row.suggestions : []).flatMap(
    (item): { kind: SuggestionKind; text: string }[] => {
      if (item === null || typeof item !== 'object') return [];
      const { kind, text } = item as { kind?: unknown; text?: unknown };
      if ((kind !== 'write' && kind !== 'try' && kind !== 'keep') || typeof text !== 'string')
        return [];
      return [{ kind, text }];
    },
  );
  return {
    id: row.id,
    entryId: row.entry_id,
    notes: row.notes,
    themes: row.themes ?? [],
    feelings: row.feelings ?? [],
    suggestions,
    createdAt: row.created_at,
  };
}

const COLUMNS = 'id, entry_id, notes, themes, feelings, suggestions, created_at';

const KNOWN_REASONS = new Set<UnavailableReason>([
  'not_allowed',
  'nothing_to_read',
  'no_model_configured',
  'daily_limit',
  'declined',
  'withheld',
  'busy',
  'model_error',
]);

/**
 * Asks for notes on one entry. `force` asks again even if there are some.
 *
 * Every failure is an outcome rather than an error, like the daily question:
 * nothing here is important enough to interrupt somebody with a problem.
 */
export async function requestReflection(entryId: string, force = false): Promise<ReflectOutcome> {
  if (!isSupabaseConfigured) return { kind: 'unavailable', reason: 'no_model_configured' };

  try {
    const { data, error } = await supabase.functions.invoke('reflect', {
      method: 'POST',
      body: { entry_id: entryId, force },
    });
    if (error !== null) {
      toAppError(error, 'reflect');
      return { kind: 'unavailable', reason: 'offline' };
    }

    const body = data as { outcome?: string; reason?: string; reflection?: Row };
    if (body.outcome === 'reflection' && body.reflection !== undefined) {
      return { kind: 'reflection', reflection: fromRow(body.reflection) };
    }
    if (body.outcome === 'support') return { kind: 'support' };

    const reason = body.reason as UnavailableReason | undefined;
    return {
      kind: 'unavailable',
      reason: reason !== undefined && KNOWN_REASONS.has(reason) ? reason : 'model_error',
    };
  } catch (error) {
    toAppError(error, 'reflect');
    return { kind: 'unavailable', reason: 'offline' };
  }
}

export async function reflectionFor(entryId: string): Promise<Reflection | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('entry_reflections')
      .select(COLUMNS)
      .eq('entry_id', entryId)
      .limit(1);
    if (error !== null || data === null) return null;
    const row = data[0] as Row | undefined;
    return row === undefined ? null : fromRow(row);
  } catch (error) {
    toAppError(error, 'read reflection');
    return null;
  }
}

export async function recentReflections(limit = 5): Promise<Reflection[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('entry_reflections')
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error !== null || data === null) return [];
    return (data as Row[]).map(fromRow);
  } catch (error) {
    toAppError(error, 'read reflections');
    return [];
  }
}

export async function deleteReflection(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from('entry_reflections').delete().eq('id', id);
    if (error !== null) {
      toAppError(error, 'delete reflection');
      return false;
    }
    return true;
  } catch (error) {
    toAppError(error, 'delete reflection');
    return false;
  }
}
