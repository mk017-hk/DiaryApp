import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
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

  const reset = useCallback(async () => {
    setProfile(EMPTY_PROFILE);
    await saveProfile(EMPTY_PROFILE);
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
      reset,
    }),
    [profile, ready, completeOnboarding, reset],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (context === null) throw new Error('useProfile must be used inside a <ProfileProvider>');
  return context;
}
