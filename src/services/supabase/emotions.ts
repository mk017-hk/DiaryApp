import { logger } from '@/services/logger';

import { isSupabaseConfigured, supabase } from './client';
import { toAppError } from './errors';

/**
 * The emotion vocabulary.
 *
 * Reference data, seeded with the schema and readable by anyone signed in.
 * Entries store the **slug**, which is stable across environments; the uuid
 * ids are generated at seed time and differ between a local stack and
 * production, so nothing outside this module should ever hold one.
 *
 * Families carry colour, not judgement. There is no bad emotion to feel in a
 * diary, and the picker must not imply otherwise.
 */

export interface Emotion {
  slug: string;
  label: string;
  family: string;
  sortOrder: number;
}

/**
 * The vocabulary as the app knows it without asking.
 *
 * Kept here so the picker works offline, on first launch, and in a build with
 * no backend — the same set the migration seeds. If the server ever disagrees,
 * the server wins; this is a floor, not a cache.
 */
export const DEFAULT_EMOTIONS: Emotion[] = [
  { slug: 'happy', label: 'Happy', family: 'warm', sortOrder: 10 },
  { slug: 'loved', label: 'Loved', family: 'warm', sortOrder: 20 },
  { slug: 'grateful', label: 'Grateful', family: 'warm', sortOrder: 30 },
  { slug: 'excited', label: 'Excited', family: 'warm', sortOrder: 40 },
  { slug: 'calm', label: 'Calm', family: 'calm', sortOrder: 50 },
  { slug: 'peaceful', label: 'Peaceful', family: 'calm', sortOrder: 60 },
  { slug: 'confident', label: 'Confident', family: 'calm', sortOrder: 70 },
  { slug: 'nostalgic', label: 'Nostalgic', family: 'reflective', sortOrder: 80 },
  { slug: 'sad', label: 'Sad', family: 'heavy', sortOrder: 90 },
  { slug: 'lonely', label: 'Lonely', family: 'heavy', sortOrder: 100 },
  { slug: 'overwhelmed', label: 'Overwhelmed', family: 'restless', sortOrder: 110 },
  { slug: 'anxious', label: 'Anxious', family: 'restless', sortOrder: 120 },
  { slug: 'angry', label: 'Angry', family: 'restless', sortOrder: 130 },
];

interface EmotionIndex {
  list: Emotion[];
  idBySlug: Map<string, string>;
  slugById: Map<string, string>;
}

/**
 * Fetched once per session.
 *
 * Thirteen rows that change only when a migration changes them. Re-fetching
 * per sync would be a request per pass for data that has not moved since the
 * schema was written.
 */
let cached: EmotionIndex | null = null;

export async function emotionIndex(): Promise<EmotionIndex> {
  if (cached !== null) return cached;

  const empty: EmotionIndex = {
    list: DEFAULT_EMOTIONS,
    idBySlug: new Map(),
    slugById: new Map(),
  };

  if (!isSupabaseConfigured) return empty;

  try {
    const { data, error } = await supabase
      .from('emotions')
      .select('id, slug, label, family, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error !== null) {
      toAppError(error, 'load emotions');
      return empty;
    }

    const rows = data ?? [];
    if (rows.length === 0) return empty;

    cached = {
      list: rows.map((row) => ({
        slug: row.slug as string,
        label: row.label as string,
        family: row.family as string,
        sortOrder: row.sort_order as number,
      })),
      idBySlug: new Map(rows.map((row) => [row.slug as string, row.id as string])),
      slugById: new Map(rows.map((row) => [row.id as string, row.slug as string])),
    };

    return cached;
  } catch (error) {
    toAppError(error, 'load emotions');
    return empty;
  }
}

/** Signing out. The next account reads the same table, but not through us. */
export function forgetEmotions(): void {
  cached = null;
}

/**
 * Replaces the emotions on a set of entries.
 *
 * Delete-then-insert rather than a diff. There are at most a handful per entry,
 * the join table has no other columns to preserve, and a diff would be more
 * code to get subtly wrong for no saved round trip.
 *
 * Silent on failure by design: emotions are a colour on an entry, and losing
 * them must never be the reason an entry itself fails to reach the account.
 */
export async function replaceEntryEmotions(
  entries: { id: string; emotions: string[] }[],
  diaryId: string,
): Promise<void> {
  if (!isSupabaseConfigured || entries.length === 0) return;

  const index = await emotionIndex();
  if (index.idBySlug.size === 0) return;

  const ids = entries.map((entry) => entry.id);

  try {
    const { error: clearError } = await supabase
      .from('entry_emotions')
      .delete()
      .in('entry_id', ids);

    if (clearError !== null) {
      toAppError(clearError, 'clear emotions');
      return;
    }

    const rows = entries.flatMap((entry) =>
      entry.emotions
        .map((slug) => index.idBySlug.get(slug))
        .filter((id): id is string => id !== undefined)
        .map((emotionId) => ({
          entry_id: entry.id,
          diary_id: diaryId,
          emotion_id: emotionId,
        })),
    );

    if (rows.length === 0) return;

    const { error } = await supabase.from('entry_emotions').insert(rows);
    if (error !== null) toAppError(error, 'save emotions');
  } catch (error) {
    logger.warn('Could not save emotions', { error });
  }
}
