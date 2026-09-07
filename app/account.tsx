import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Divider, Field, Screen, Text } from '@/components';
import { space } from '@/design';
import { AuthNotice, useSession } from '@/features/auth';
import { clearEntries } from '@/features/entries/entryStore';
import { deleteAllRecordings } from '@/features/media';
import { useProfile } from '@/features/profile';

/**
 * Your account.
 *
 * Two irreversible things live here, and both are written to be hard to do by
 * accident and impossible to misunderstand: signing out clears this device,
 * and deleting removes everything, everywhere, for good.
 */
export default function Account() {
  const router = useRouter();
  const { status, user, signOut, deleteAccount } = useSession();
  const { name, reset } = useProfile();

  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const wipeDevice = async () => {
    // Entries are still local until Phase 2, so signing out has to take them
    // with it. Leaving one person's diary on the device for the next person to
    // sign in and find would be the worst bug this app could have.
    await Promise.all([clearEntries(), deleteAllRecordings(), reset()]);
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sign out?',
      'Your entries are on this device, so signing out removes them from it. Anything already saved to your account comes back when you sign in.',
      [
        { text: 'Stay signed in', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              const result = await signOut();
              await wipeDevice();
              setBusy(false);
              if (!result.ok) setNotice(result.error.userMessage);
            })();
          },
        },
      ],
    );
  };

  const runDelete = async () => {
    setBusy(true);
    setNotice(null);
    const result = await deleteAccount();

    if (!result.ok) {
      setBusy(false);
      setNotice(result.error.userMessage);
      return;
    }

    await wipeDevice();
    setBusy(false);
  };

  return (
    <Screen scroll padded>
      <View style={styles.page}>
        <Text variant="title1">Your account</Text>

        {notice !== null && <AuthNotice message={notice} />}

        {status === 'signed-in' ? (
          <Text variant="callout" color="inkSecondary">
            Signed in as {user?.email ?? 'your account'}
            {name === '' ? '' : `, ${name}`}.
          </Text>
        ) : (
          <Text variant="callout" color="inkSecondary">
            This build has no account service, so your diary lives on this device only.
          </Text>
        )}

        <Divider />

        <Button
          label="App lock"
          variant="secondary"
          onPress={() => router.push('/security')}
          fullWidth
        />

        {status === 'signed-in' && (
          <>
            <Button label="Sign out" variant="secondary" onPress={confirmSignOut} fullWidth />

            <Divider />

            <Text variant="overline" color="inkTertiary">
              Delete account
            </Text>
            <Text variant="caption" color="inkTertiary">
              Every entry, every video, every word. Deleted from your phone and from our servers,
              and not recoverable by us or by you. There is no undo and no grace period.
            </Text>

            {confirming ? (
              <View style={styles.confirm}>
                <Field
                  label="Type DELETE to confirm"
                  value={typed}
                  onChangeText={setTyped}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="DELETE"
                />
                <Button
                  label="Delete everything"
                  variant="danger"
                  disabled={typed.trim().toUpperCase() !== 'DELETE'}
                  loading={busy}
                  onPress={() => void runDelete()}
                  fullWidth
                />
                <Button
                  label="Keep my diary"
                  variant="ghost"
                  onPress={() => {
                    setConfirming(false);
                    setTyped('');
                  }}
                  fullWidth
                />
              </View>
            ) : (
              <Button
                label="Delete my account"
                variant="danger"
                onPress={() => setConfirming(true)}
                fullWidth
              />
            )}
          </>
        )}

        <Divider />

        <Button label="Back" variant="ghost" onPress={() => router.back()} disabled={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  confirm: { gap: space.xs },
  page: { gap: space.md, paddingTop: space.xl },
});
