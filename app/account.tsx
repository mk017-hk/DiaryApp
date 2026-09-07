import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Divider, Field, Screen, Text } from '@/components';
import { space } from '@/design';
import { AuthNotice, useSession } from '@/features/auth';
import { clearEntries, clearThreads, useSync } from '@/features/entries';
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
  const { pending, syncNow } = useSync();

  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const wipeDevice = async () => {
    // Entries live on the device, so signing out has to take them with it.
    // Leaving one person's diary on the phone for the next person to sign in
    // and find would be the worst bug this app could have.
    await Promise.all([clearEntries(), clearThreads(), deleteAllRecordings(), reset()]);
  };

  const finishSignOut = () => {
    void (async () => {
      setBusy(true);
      const result = await signOut();
      await wipeDevice();
      setBusy(false);
      if (!result.ok) setNotice(result.error.userMessage);
    })();
  };

  /**
   * Sign out, without quietly destroying anything.
   *
   * The wipe above is not reversible, so anything that has not reached the
   * account yet dies with it. One last sync is attempted first, and if entries
   * are still stranded afterwards — no signal, most likely — the confirmation
   * says exactly how many rather than letting someone find out later.
   */
  const confirmSignOut = () => {
    void (async () => {
      let stranded = pending;

      if (stranded > 0) {
        setBusy(true);
        const report = await syncNow();
        setBusy(false);
        if (report?.status === 'ok') stranded = 0;
      }

      if (stranded > 0) {
        Alert.alert(
          stranded === 1
            ? 'One entry has not been saved yet'
            : `${String(stranded)} entries have not been saved yet`,
          'They are on this phone but have not reached your account, and signing out removes them from the phone. Try again once you have a connection.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Sign out anyway', style: 'destructive', onPress: finishSignOut },
          ],
        );
        return;
      }

      Alert.alert(
        'Sign out?',
        'Your entries are safe in your account. This removes them from the phone until you sign in again.',
        [
          { text: 'Stay signed in', style: 'cancel' },
          { text: 'Sign out', style: 'destructive', onPress: finishSignOut },
        ],
      );
    })();
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
