import { useEffect } from 'react';

import { useSession } from '@/features/auth';
import { useProfile } from '@/features/profile';
import { setConsent } from '@/services/supabase/assistant';

/**
 * Delivers the answer given during onboarding, once there is somewhere to put it.
 *
 * Onboarding asks about the assistant before sign-up, which is the right order
 * — it is a question about the product, not about an account — but it means
 * the answer has nowhere server-side to go at the moment it is given.
 * `set_assistant_consent` updates the row matching `auth.uid()`, and with no
 * session that matched nothing at all: somebody would say yes, the update
 * would quietly affect zero rows, and the assistant would stay off.
 *
 * That is exactly what happened, and it was invisible from inside the app —
 * `ai_enabled` defaults to true, so the settings screen said "On" while
 * `assistant_allowed()` was returning false the whole time. It took reading
 * the profile row straight out of Postgres after a browser run to see it.
 *
 * So the answer waits on the device and is applied here, once. Rendering
 * nothing: this is a piece of behaviour, not a piece of interface.
 */
export function PendingConsent() {
  const { status } = useSession();
  const { profile, ready, clearPendingConsent } = useProfile();

  const pending = profile.assistantConsent;

  useEffect(() => {
    if (!ready || status !== 'signed-in' || pending === undefined) return;

    let cancelled = false;
    void setConsent(pending).then((ok) => {
      // Cleared only on success. A failed attempt stays pending and is retried
      // next launch, rather than losing an answer somebody actually gave.
      if (ok && !cancelled) void clearPendingConsent();
    });

    return () => {
      cancelled = true;
    };
  }, [ready, status, pending, clearPendingConsent]);

  return null;
}
