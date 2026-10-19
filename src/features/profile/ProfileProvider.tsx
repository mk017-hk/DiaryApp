import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import {
  clearProfile,
  EMPTY_PROFILE,
  firstName,
  loadProfile,
  saveProfile,
  type CapturePreferenceId,
  type IntentionId,
  type Profile,
  type ToneId,
} from './profileStore';

interface ProfileContextValue {
  profile: Profile;
  /** Undefined until the stored profile has been read. */
  ready: boolean;
  name: string;
  onboarded: boolean;
  tone: ToneId;
  intentions: IntentionId[];
  capture: CapturePreferenceId;
  completeOnboarding: (input: {
    name: string;
    intentions: IntentionId[];
    tone: ToneId;
    capture: CapturePreferenceId;
    assistantConsent: boolean;
  }) => Promise<void>;
  /** Clears the held answer once it has reached the account. */
  clearPendingConsent: () => Promise<void>;
  /** Fills an empty profile from the name on an account. See the provider. */
  adoptAccountName: (name: string) => Promise<void>;
  reset: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setStoredProfile] = useState<Profile>(EMPTY_PROFILE);
  const [ready, setReady] = useState(false);

  /**
   * Whether anything has written the profile since mount.
   *
   * The initial load is a read of storage that can resolve late — and a
   * different account signing in replaces the profile during launch, which can
   * land first. Without this the load would arrive afterwards and put the
   * previous person's name back on screen. Storage would be right; the screen
   * would not.
   */
  const written = useRef(false);
  const setProfile: typeof setStoredProfile = useCallback((next) => {
    written.current = true;
    setStoredProfile(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadProfile().then((loaded) => {
      if (cancelled) return;
      if (!written.current) setStoredProfile(loaded);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const completeOnboarding = useCallback(
    async (input: {
      name: string;
      intentions: IntentionId[];
      tone: ToneId;
      capture: CapturePreferenceId;
      assistantConsent: boolean;
    }) => {
      const next: Profile = {
        name: input.name.trim(),
        intentions: input.intentions,
        tone: input.tone,
        capture: input.capture,
        assistantConsent: input.assistantConsent,
        onboardedAt: new Date().toISOString(),
      };
      setProfile(next);
      await saveProfile(next);
    },
    [setProfile],
  );

  /**
   * Adopts the name on an account.
   *
   * Someone who signs in on a new phone has an account but nothing stored
   * locally, and walking them back through "what should I call you?" when the
   * app already knows would be absurd. The name from their account is enough
   * to count as onboarded; the rest are preferences with sensible defaults
   * they can change in Settings.
   *
   * Callers check `onboarded` first: a profile already on the device wins,
   * because it holds choices this cannot recover.
   */
  const adoptAccountName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (trimmed.length === 0) return;

      const next: Profile = {
        ...EMPTY_PROFILE,
        name: trimmed,
        onboardedAt: new Date().toISOString(),
      };
      setProfile(next);
      await saveProfile(next);
    },
    [setProfile],
  );

  const clearPendingConsent = useCallback(async () => {
    setProfile((current) => {
      const { assistantConsent: _answered, ...rest } = current;
      void saveProfile(rest);
      return rest;
    });
  }, [setProfile]);

  const reset = useCallback(async () => {
    setProfile(EMPTY_PROFILE);
    await clearProfile();
  }, [setProfile]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      ready,
      name: firstName(profile),
      tone: profile.tone,
      intentions: profile.intentions,
      capture: profile.capture,
      onboarded: profile.onboardedAt !== null,
      completeOnboarding,
      adoptAccountName,
      clearPendingConsent,
      reset,
    }),
    [profile, ready, completeOnboarding, adoptAccountName, clearPendingConsent, reset],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (context === null) throw new Error('useProfile must be used inside a <ProfileProvider>');
  return context;
}
