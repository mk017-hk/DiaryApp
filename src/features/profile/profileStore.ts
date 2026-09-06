import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '@/services/logger';

/**
 * Who the person using this app is.
 *
 * Held locally for now so the app can be personalised before authentication
 * exists. When Phase 2 lands this reads through to `profiles` in Supabase —
 * the shape here deliberately matches that table so the swap is a change of
 * implementation, not of every call site.
 *
 * AsyncStorage rather than SecureStore: a first name is not a secret, and the
 * keychain is reserved for things that are.
 */

const KEY = 'profile.v1';

export interface Profile {
  name: string;
  /** What they said they were here for. Shapes the assistant's tone. */
  intention?: string;
  onboardedAt: string | null;
}

export const EMPTY_PROFILE: Profile = { name: '', onboardedAt: null };

export async function loadProfile(): Promise<Profile> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return EMPTY_PROFILE;

    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      ...(typeof parsed.intention === 'string' ? { intention: parsed.intention } : {}),
      onboardedAt: typeof parsed.onboardedAt === 'string' ? parsed.onboardedAt : null,
    };
  } catch (error) {
    logger.error('Could not load profile', { error });
    return EMPTY_PROFILE;
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(profile));
  } catch (error) {
    logger.error('Could not save profile', { error });
  }
}

export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/** First name only — the assistant speaks to a person, not a full record. */
export function firstName(profile: Profile): string {
  return profile.name.trim().split(/\s+/)[0] ?? '';
}
