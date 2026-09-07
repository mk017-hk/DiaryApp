import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, DiaryPage, Text } from '@/components';
import { space, useTheme } from '@/design';
import { useProfile } from '@/features/profile';

/**
 * The door.
 *
 * Reached by someone who has onboarded but has no session — a new device, a
 * sign-out, or an account that expired. It knows their name if the device
 * does, and says so, because being greeted by name is the difference between
 * coming back to something of yours and logging into a service.
 */
export default function Welcome() {
  const router = useRouter();
  const theme = useTheme();
  const { name } = useProfile();

  return (
    <DiaryPage>
      <View style={[styles.page, { padding: theme.screenPadding }]}>
        <View style={styles.copy}>
          <Text variant="display">{name === '' ? 'Your diary.' : `Welcome back, ${name}.`}</Text>
          <Text variant="callout" color="inkSecondary">
            {name === ''
              ? 'Write it, speak it, record it. It stays yours.'
              : 'Sign in and everything is where you left it.'}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button label="Sign in" onPress={() => router.push('/sign-in')} fullWidth />
          <Button
            label="Create an account"
            variant="ghost"
            onPress={() => router.push('/sign-up')}
            fullWidth
          />
        </View>
      </View>
    </DiaryPage>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.xxs },
  copy: { gap: space.sm, maxWidth: 480 },
  page: { flex: 1, gap: space.xl, justifyContent: 'center' },
});
