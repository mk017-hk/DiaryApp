import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Divider, Screen, Text } from '@/components';
import { space } from '@/design';
import { listEntries, listQuietDates, listThreads } from '@/features/entries';
import {
  clearArchive,
  saveMediaToLibrary,
  writeArchive,
  type WrittenArchive,
} from '@/features/export';
import { listLetters } from '@/features/letters';
import { useProfile } from '@/features/profile';
import { logger } from '@/services/logger';

/**
 * Taking a copy of everything.
 *
 * The test of whether somebody owns their diary is whether they can walk away
 * with it. So this produces a folder, not a summary: a JSON file another
 * program could read, a page that opens in any browser with no app and no
 * network, and the actual video and photo files beside them.
 *
 * It is offered next to account deletion rather than buried, because the moment
 * most people want a copy is the moment before they delete something.
 */
export default function Export() {
  const router = useRouter();
  const { profile } = useProfile();

  const [busy, setBusy] = useState(false);
  const [written, setWritten] = useState<WrittenArchive | null>(null);
  const [failed, setFailed] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const run = () => {
    void (async () => {
      setBusy(true);
      setFailed(false);

      try {
        const [entries, threads, quietDates, letters] = await Promise.all([
          listEntries(),
          listThreads(),
          listQuietDates(),
          listLetters(),
        ]);

        setWritten(writeArchive({ entries, threads, quietDates, letters, profile }));
      } catch (error) {
        logger.error('Could not write the export', { error });
        setFailed(true);
      } finally {
        setBusy(false);
      }
    })();
  };

  const saveMedia = () => {
    void (async () => {
      setBusy(true);
      const [entries] = await Promise.all([listEntries()]);
      const result = await saveMediaToLibrary(entries);
      setBusy(false);

      if (!result.ok) {
        Alert.alert(
          'Photos said no',
          'Without permission to add to your photo library there is nowhere for the videos to go. You can change that in Settings.',
        );
        return;
      }

      setSavedCount(result.value.saved);
    })();
  };

  const share = () => {
    if (written === null) return;

    void (async () => {
      if (!(await Sharing.isAvailableAsync())) return;
      await Sharing.shareAsync(written.htmlPath);
    })();
  };

  return (
    <Screen scroll padded>
      <View style={styles.page}>
        <Text variant="title1">Take a copy</Text>
        <Text variant="callout" color="inkSecondary">
          Everything you have written, in a folder you keep. A page that opens in any browser
          without this app, a file another program can read, and your videos, photos and voice notes
          beside them.
        </Text>

        <Divider />

        {written === null ? (
          <>
            <Button label="Make a copy" onPress={run} loading={busy} fullWidth />
            {failed && (
              <Text variant="caption" color="inkTertiary">
                That did not finish. There may not be room on the phone for a second copy of
                everything — it needs about as much space again as your diary already takes.
              </Text>
            )}
          </>
        ) : (
          <>
            <Text variant="label">Your copy is ready.</Text>
            <Text variant="caption" color="inkTertiary">
              Everything you have written, as a page you can open in any browser and a file another
              program can read.
            </Text>

            <Button label="Save or send it" onPress={share} fullWidth />

            {written.mediaOnPhone > 0 && (
              <>
                <Divider />
                <Text variant="overline" color="inkTertiary">
                  Your videos and photos
                </Text>
                {/* They go to Photos rather than into the folder, because the
                    only way to make a folder reachable on iOS would expose the
                    directory the diary's own recordings live in. */}
                <Text variant="caption" color="inkTertiary">
                  {savedCount === null
                    ? 'Too large to travel inside a file. They can go to an album in your photos instead, where you can already reach and back them up.'
                    : `${String(savedCount)} ${
                        savedCount === 1 ? 'file is' : 'files are'
                      } in the Diary album in your photos.`}
                </Text>
                {savedCount === null && (
                  <Button
                    label={`Save ${String(written.mediaOnPhone)} to my photos`}
                    variant="secondary"
                    onPress={saveMedia}
                    loading={busy}
                    fullWidth
                  />
                )}
              </>
            )}

            {written.mediaRemoteOnly > 0 && (
              <Text variant="caption" color="inkTertiary">
                {String(written.mediaRemoteOnly)}{' '}
                {written.mediaRemoteOnly === 1 ? 'file is' : 'files are'} in your account rather
                than on this phone, so {written.mediaRemoteOnly === 1 ? 'it is' : 'they are'} listed
                but not here. Open {written.mediaRemoteOnly === 1 ? 'that entry' : 'those entries'}{' '}
                once with a connection and {written.mediaRemoteOnly === 1 ? 'it' : 'they'} will come
                down.
              </Text>
            )}

            <Button
              label="Remove this copy from the phone"
              variant="ghost"
              onPress={() => {
                clearArchive();
                setWritten(null);
                setSavedCount(null);
              }}
              fullWidth
            />
          </>
        )}

        <Divider />

        <Text variant="caption" color="inkTertiary">
          A letter you have not opened yet is listed but cannot be included — it is sealed, and not
          even this can read it.
        </Text>

        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.md, paddingTop: space.xl },
});
