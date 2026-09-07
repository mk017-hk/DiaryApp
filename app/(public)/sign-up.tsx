import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { Button, Field, PressableScale, Text } from '@/components';
import { space } from '@/design';
import {
  AppleButton,
  AuthNotice,
  AuthPage,
  emailError,
  MIN_PASSWORD_LENGTH,
  passwordError,
  useSession,
} from '@/features/auth';
import { useProfile } from '@/features/profile';

/**
 * Create an account.
 *
 * Reached at the end of onboarding, which has already asked for a name — so
 * this does not ask again. Being asked the same question twice in the first
 * two minutes is how an app tells you it isn't paying attention.
 */
export default function SignUp() {
  const router = useRouter();
  const { signUp } = useSession();
  const { profile, name } = useProfile();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const emailFault = emailError(email);
    const passwordFault = passwordError(password);

    setErrors({
      ...(emailFault !== undefined && { email: emailFault }),
      ...(passwordFault !== undefined && { password: passwordFault }),
    });
    setNotice(null);
    if (emailFault !== undefined || passwordFault !== undefined) return;

    setBusy(true);
    const result = await signUp(email, password, profile.name);
    setBusy(false);

    if (!result.ok) {
      setNotice(result.error.userMessage);
      return;
    }

    // Where confirmation is required there is no session yet, so the guard
    // will not move anyone anywhere. Say what happens next instead of leaving
    // them on a form that looks like it did nothing.
    if (result.value.needsConfirmation) setSent(true);
  };

  if (sent) {
    return (
      <AuthPage
        title="Check your email."
        subtitle={`We've sent a link to ${email.trim()}. Open it and your diary is ready.`}
      >
        <View style={styles.actions}>
          <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} fullWidth />
        </View>
      </AuthPage>
    );
  }

  return (
    <AuthPage
      title={name === '' ? 'Keep it safe.' : `Nearly there, ${name}.`}
      subtitle="An account keeps your diary backed up, and lets you open it on another phone."
      onBack={() => router.replace('/welcome')}
    >
      <View style={styles.form}>
        {notice !== null && <AuthNotice message={notice} />}

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          {...(errors.email !== undefined ? { error: errors.email } : {})}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />

        <Field
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          {...(errors.password !== undefined ? { error: errors.password } : {})}
          hint={`At least ${String(MIN_PASSWORD_LENGTH)} characters. A phrase you'll remember beats a clever one.`}
          autoCapitalize="none"
          autoComplete="new-password"
          secureTextEntry
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
      </View>

      <View style={styles.actions}>
        <Button label="Create my diary" onPress={() => void submit()} loading={busy} fullWidth />
        <AppleButton onError={setNotice} />
        <PressableScale
          onPress={() => router.replace('/sign-in')}
          haptic="light"
          accessibilityLabel="Sign in instead"
          style={styles.link}
        >
          <Text variant="caption" color="inkTertiary">
            Already have an account?{' '}
            <Text variant="caption" color="accent">
              Sign in
            </Text>
          </Text>
        </PressableScale>
      </View>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.xs },
  form: { gap: space.md },
  link: { alignItems: 'center', paddingVertical: space.sm },
});
