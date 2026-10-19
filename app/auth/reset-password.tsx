import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Field } from '@/components';
import { space } from '@/design';
import {
  AuthNotice,
  AuthPage,
  MIN_PASSWORD_LENGTH,
  passwordError,
  useSession,
} from '@/features/auth';

/**
 * Choosing a new password, from a reset link.
 *
 * The last step between somebody who forgot their password and their diary.
 * Before this screen existed, a reset email arrived, its link opened a web page
 * with nowhere to type anything, and the diary was simply out of reach —
 * which in an app holding years of somebody's life is not a minor bug.
 *
 * Lives outside `(public)` on purpose. A recovery link signs the person in, and
 * the root gate sends any signed-in person away from the public screens; this
 * one has to be reachable in exactly that state.
 *
 * One field, not two. A confirmation field catches typos at the cost of
 * doubling the typing on a phone keyboard, and the system's password manager
 * offers to save what is typed here — which is the better protection against
 * not remembering it.
 */
export default function ResetPassword() {
  const router = useRouter();
  const { status, setNewPassword } = useSession();

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // A recovery link signs somebody in. Arriving here without a session means
  // the link expired or was never followed, and the form below would fail on
  // submit with a message about something else entirely.
  if (status !== 'signed-in' && !done) {
    return (
      <AuthPage
        title="That link has run out."
        subtitle="Reset links work once and expire after a while. Ask for a new one and use it on this phone."
      >
        <View style={styles.actions}>
          <Button
            label="Send a new link"
            onPress={() => router.replace('/forgot-password')}
            fullWidth
          />
        </View>
      </AuthPage>
    );
  }

  const submit = async () => {
    const invalid = passwordError(password);
    setError(invalid);
    setNotice(null);
    if (invalid !== undefined) return;

    setBusy(true);
    const result = await setNewPassword(password);
    setBusy(false);

    if (!result.ok) {
      setNotice(result.error.userMessage);
      return;
    }

    setDone(true);
  };

  if (done) {
    return (
      <AuthPage
        title="That's done."
        subtitle="Your password is changed. Any other phone signed in to your diary has been signed out, in case somebody else had the old one — nothing on them is lost."
      >
        <View style={styles.actions}>
          <Button label="Open my diary" onPress={() => router.replace('/')} fullWidth />
        </View>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Choose a new password." subtitle="Then you're back in.">
      <View style={styles.form}>
        {notice !== null && <AuthNotice message={notice} />}

        <Field
          label="New password"
          value={password}
          onChangeText={setPassword}
          {...(error !== undefined ? { error } : {})}
          hint={`At least ${String(MIN_PASSWORD_LENGTH)} characters. A phrase you'll remember beats a clever one.`}
          autoCapitalize="none"
          autoComplete="new-password"
          autoFocus
          secureTextEntry
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
      </View>

      <View style={styles.actions}>
        <Button label="Save it" onPress={() => void submit()} loading={busy} fullWidth />
      </View>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.xs },
  form: { gap: space.md },
});
