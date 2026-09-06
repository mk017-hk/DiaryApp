import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '@/services/logger';

/**
 * Who the person using this app is, and how they want to be spoken to.
 *
 * Held locally for now so the app can be personalised before authentication
 * exists. The shape matches the `profiles` table it will become, so Phase 2
 * swaps the implementation rather than every call site.
 *
 * AsyncStorage rather than SecureStore: a name and a tone preference are not
 * secrets, and the keychain is reserved for things that are.
 */

const KEY = 'profile.v1';

/**
 * Profile persistence, currently off.
 *
 * While onboarding is still being shaped, the app starts fresh on every
 * launch so the flow can be walked through again and again without deleting
 * and reinstalling. Anything a previous build wrote is cleared on first load
 * rather than left behind as dead data.
 *
 * Entries are unaffected — those still save, or there would be nothing to
 * test the diary with.
 *
 * Flip to true when onboarding settles.
 */
const PERSIST_PROFILE = false;

/** What someone is here for. More than one can be true at once. */
export const INTENTIONS = [
  { id: 'everyday', label: 'Remember the everyday' },
  { id: 'through', label: 'Get through something' },
  { id: 'change', label: 'Watch myself change' },
  { id: 'record', label: 'Keep a record for later' },
  { id: 'people', label: 'Hold on to people' },
  { id: 'creative', label: 'Somewhere to think out loud' },
] as const;

export type IntentionId = (typeof INTENTIONS)[number]['id'];

/** How the assistant speaks. This changes real copy, not just a setting row. */
export const TONES = [
  { id: 'gentle', label: 'Gently', sample: 'Whenever you’re ready — how are you today?' },
  { id: 'warm', label: 'Like a friend', sample: 'Hey you. How’s today been?' },
  { id: 'direct', label: 'Plainly', sample: 'How was today?' },
  { id: 'quiet', label: 'Barely at all', sample: 'Today?' },
] as const;

export type ToneId = (typeof TONES)[number]['id'];

/** Which way of capturing gets the big button. */
export const CAPTURE_PREFERENCES = [
  { id: 'video', label: 'Talking to camera' },
  { id: 'write', label: 'Writing it down' },
  { id: 'either', label: 'Depends on the day' },
] as const;

export type CapturePreferenceId = (typeof CAPTURE_PREFERENCES)[number]['id'];

export interface Profile {
  name: string;
  intentions: IntentionId[];
  tone: ToneId;
  capture: CapturePreferenceId;
  onboardedAt: string | null;
}

export const EMPTY_PROFILE: Profile = {
  name: '',
  intentions: [],
  tone: 'gentle',
  capture: 'either',
  onboardedAt: null,
};

const INTENTION_IDS = new Set<string>(INTENTIONS.map((i) => i.id));
const TONE_IDS = new Set<string>(TONES.map((t) => t.id));
const CAPTURE_IDS = new Set<string>(CAPTURE_PREFERENCES.map((c) => c.id));

/**
 * Reads a stored profile, tolerating the earlier single-`intention` shape.
 *
 * Someone who already onboarded must not be dragged back through it because
 * the schema changed underneath them.
 */
function migrate(parsed: Record<string, unknown>): Profile {
  const legacyIntention = typeof parsed.intention === 'string' ? parsed.intention : null;
  const legacyMatch =
    legacyIntention === null
      ? undefined
      : INTENTIONS.find((option) => option.label === legacyIntention)?.id;

  const stored = Array.isArray(parsed.intentions)
    ? parsed.intentions.filter(
        (id): id is IntentionId => typeof id === 'string' && INTENTION_IDS.has(id),
      )
    : [];

  const intentions = stored.length > 0 ? stored : legacyMatch !== undefined ? [legacyMatch] : [];

  return {
    name: typeof parsed.name === 'string' ? parsed.name : '',
    intentions,
    tone:
      typeof parsed.tone === 'string' && TONE_IDS.has(parsed.tone)
        ? (parsed.tone as ToneId)
        : 'gentle',
    capture:
      typeof parsed.capture === 'string' && CAPTURE_IDS.has(parsed.capture)
        ? (parsed.capture as CapturePreferenceId)
        : 'either',
    onboardedAt: typeof parsed.onboardedAt === 'string' ? parsed.onboardedAt : null,
  };
}

export async function loadProfile(): Promise<Profile> {
  if (!PERSIST_PROFILE) {
    // Clear anything an earlier build left, so onboarding always starts clean
    // and no stale profile lingers on the device.
    await clearProfile();
    return EMPTY_PROFILE;
  }

  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return EMPTY_PROFILE;
    return migrate(JSON.parse(raw) as Record<string, unknown>);
  } catch (error) {
    logger.error('Could not load profile', { error });
    return EMPTY_PROFILE;
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  if (!PERSIST_PROFILE) return;

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

export const __testing = { migrate };
