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
  signInPasswordError,
  useSession,
} from '@/features/auth';

/**
 * Sign in.
 *
 * Nothing here says whether an account exists. A form that answers that
 * question is a way to find out who keeps a diary, and for this app in
 * particular that is not a harmless leak.
 */
export default function SignIn() {
  const router = useRouter();
  const { signIn } = useSession();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const emailFault = emailError(email);
    const passwordFault = signInPasswordError(password);

    setErrors({
      ...(emailFault !== undefined && { email: emailFault }),
      ...(passwordFault !== undefined && { password: passwordFault }),
    });
    setNotice(null);
    if (emailFault !== undefined || passwordFault !== undefined) return;

    setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);

    // On success the session guard in the root layout takes over; navigating
    // from here as well would race it.
    if (!result.ok) setNotice(result.error.userMessage);
  };

  return (
    <AuthPage
      title="Welcome back."
      subtitle="Everything is where you left it."
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
          autoCapitalize="none"
          autoComplete="current-password"
          secureTextEntry
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />

        <PressableScale
          onPress={() => router.push('/forgot-password')}
          haptic="light"
          accessibilityLabel="Forgot your password?"
          style={styles.inlineLink}
        >
          <Text variant="caption" color="accent">
            Forgot your password?
          </Text>
        </PressableScale>
      </View>

      <View style={styles.actions}>
        <Button label="Sign in" onPress={() => void submit()} loading={busy} fullWidth />
        <AppleButton onError={setNotice} />
        <PressableScale
          onPress={() => router.replace('/sign-up')}
          haptic="light"
          accessibilityLabel="Create an account instead"
          style={styles.link}
        >
          <Text variant="caption" color="inkTertiary">
            New here?{' '}
            <Text variant="caption" color="accent">
              Create an account
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
  inlineLink: { alignSelf: 'flex-start', paddingVertical: space.xxs },
  link: { alignItems: 'center', paddingVertical: space.sm },
});
