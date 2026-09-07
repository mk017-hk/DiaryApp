import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Field } from '@/components';
import { space } from '@/design';
import { AuthNotice, AuthPage, emailError, useSession } from '@/features/auth';

/**
 * Password reset.
 *
 * The confirmation is identical whether or not the address has an account.
 * Anything else turns this form into a way of asking "does this person keep a
 * diary here?", which is exactly the question this app should never answer.
 */
export default function ForgotPassword() {
  const router = useRouter();
  const { requestPasswordReset } = useSession();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const invalid = emailError(email);
    setError(invalid);
    setNotice(null);
    if (invalid !== undefined) return;

    setBusy(true);
    const result = await requestPasswordReset(email);
    setBusy(false);

    // Rate limiting is the one failure worth showing: it is about the request,
    // not the account, and silently doing nothing would be a lie.
    if (!result.ok && result.error.kind === 'rate_limit') {
      setNotice(result.error.userMessage);
      return;
    }

    setSent(true);
  };

  if (sent) {
    return (
      <AuthPage
        title="Check your email."
        subtitle={`If ${email.trim()} has an account, a reset link is on its way.`}
      >
        <View style={styles.actions}>
          <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} fullWidth />
        </View>
      </AuthPage>
    );
  }

  return (
    <AuthPage
      title="Let's get you back in."
      subtitle="Tell us your email and we'll send a link to set a new password."
      onBack={() => router.replace('/sign-in')}
    >
      <View style={styles.form}>
        {notice !== null && <AuthNotice message={notice} />}

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          {...(error !== undefined ? { error } : {})}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          autoFocus
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
      </View>

      <View style={styles.actions}>
        <Button label="Send the link" onPress={() => void submit()} loading={busy} fullWidth />
      </View>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.xs },
  form: { gap: space.md },
});
