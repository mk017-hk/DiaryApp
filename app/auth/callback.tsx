import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components';
import { space } from '@/design';
import { AuthPage, parseAuthLink, queryFromParams, useSession } from '@/features/auth';
import type { AuthLinkOutcome } from '@/services/supabase/auth';

/**
 * Where a link in an email lands.
 *
 * A confirmation after sign-up, or a password reset. Either way somebody has
 * just left their email app to come here, and the one thing this screen must
 * not do is leave them on a blank page wondering whether it worked.
 *
 * Exempt from the root gate's redirects, which would otherwise send a
 * signed-out visitor to the welcome screen before the link had been read —
 * the exact visitor this route exists for.
 */
export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const url = Linking.useURL();
  const { status, completeAuthLink } = useSession();

  const [outcome, setOutcome] = useState<AuthLinkOutcome | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // The router hands over the query and drops the fragment. PKCE and
  // token-hash links live in the query; an implicit-flow link has its tokens
  // in the fragment, which only the full URL still carries. Whichever of the
  // two actually holds a link is the one to use.
  const query = queryFromParams(params);
  const link = useMemo(
    () => (url !== null && parseAuthLink(url).kind !== 'empty' ? url : query),
    [url, query],
  );

  // A code can be exchanged exactly once. Without this, a second render with
  // the same link would try again and replace a success with a failure.
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (attempted.current === link) return;
    attempted.current = link;

    void completeAuthLink(link).then((result) => {
      if (result.ok) setOutcome(result.value);
      else setFailure(result.error.userMessage);
    });
  }, [link, completeAuthLink]);

  // Moving on waits for the session provider rather than for the exchange.
  // Between the two, this phone is checked for somebody else's diary; going to
  // Today any sooner would mean arriving as signed-out and being bounced to
  // the welcome screen first.
  useEffect(() => {
    if (outcome === 'nothing') {
      router.replace('/');
      return;
    }
    if (outcome === null || status !== 'signed-in') return;

    router.replace(outcome === 'recovery' ? '/auth/reset-password' : '/');
  }, [outcome, status, router]);

  if (failure !== null) {
    return (
      <AuthPage title="That link didn't work." subtitle={failure}>
        {/* Signing in first, because it is right for both kinds of link: a
            confirmation link that failed here has usually still confirmed the
            account, and a reset is one tap further from the sign-in screen. */}
        <View style={styles.actions}>
          <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} fullWidth />
          <Button
            label="Send a new reset link"
            variant="ghost"
            onPress={() => router.replace('/forgot-password')}
            fullWidth
          />
        </View>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="One moment." subtitle="Opening your diary.">
      <View />
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.xs },
});
