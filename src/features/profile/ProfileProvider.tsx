import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { EMPTY_PROFILE, firstName, loadProfile, saveProfile, type Profile } from './profileStore';

interface ProfileContextValue {
  profile: Profile;
  /** Undefined until the stored profile has been read. */
  ready: boolean;
  name: string;
  onboarded: boolean;
  completeOnboarding: (input: { name: string; intention?: string }) => Promise<void>;
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

  const completeOnboarding = useCallback(async (input: { name: string; intention?: string }) => {
    const next: Profile = {
      name: input.name.trim(),
      ...(input.intention !== undefined ? { intention: input.intention } : {}),
      onboardedAt: new Date().toISOString(),
    };
    setProfile(next);
    await saveProfile(next);
  }, []);

  const reset = useCallback(async () => {
    setProfile(EMPTY_PROFILE);
    await saveProfile(EMPTY_PROFILE);
  }, []);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      ready,
      name: firstName(profile),
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
