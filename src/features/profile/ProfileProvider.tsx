import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
  }) => Promise<void>;
  /** Fills an empty profile from the name on an account. See the provider. */
  adoptAccountName: (name: string) => Promise<void>;
  reset: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadProfile().then((loaded) => {
      if (cancelled) return;
      setProfile(loaded);
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
    }) => {
      const next: Profile = {
        name: input.name.trim(),
        intentions: input.intentions,
        tone: input.tone,
        capture: input.capture,
        onboardedAt: new Date().toISOString(),
      };
      setProfile(next);
      await saveProfile(next);
    },
    [],
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
  const adoptAccountName = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;

    const next: Profile = {
      ...EMPTY_PROFILE,
      name: trimmed,
      onboardedAt: new Date().toISOString(),
    };
    setProfile(next);
    await saveProfile(next);
  }, []);

  const reset = useCallback(async () => {
    setProfile(EMPTY_PROFILE);
    await clearProfile();
  }, []);

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
      reset,
    }),
    [profile, ready, completeOnboarding, adoptAccountName, reset],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (context === null) throw new Error('useProfile must be used inside a <ProfileProvider>');
  return context;
}
