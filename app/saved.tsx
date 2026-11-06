import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, PressableScale, Screen, Text } from '@/components';
import { space } from '@/design';
import { listEntries, useEntryChanges, type Entry } from '@/features/entries';
import { EntryCard } from '@/features/entries/EntryCard';

/**
 * Saved entries.
 *
 * Every entry has had a Save button since the beginning, and until now there
 * was nowhere to find what it saved. This is that place: the entries she
 * marked to keep close, newest first.
 */
export default function Saved() {
  const router = useRouter();
  const [saved, setSaved] = useState<Entry[]>([]);

  const load = useCallback(async () => {
    setSaved((await listEntries()).filter((entry) => entry.isFavourite));
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEntryChanges(() => void load());

  return (
    <Screen scroll padded>
      <View style={styles.page}>
        <View style={styles.header}>
          <PressableScale onPress={() => router.back()} accessibilityLabel="Back">
            <Icon name="chevron-left" size={28} color="ink" />
          </PressableScale>
          <Text variant="title2">Saved</Text>
        </View>

        {saved.length === 0 ? (
          <Card tone="surface">
            <Text variant="callout" color="inkSecondary">
              Nothing saved yet. Open any entry and tap Save to keep it here.
            </Text>
          </Card>
        ) : (
          saved.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onPress={() => router.push(`/entry/${entry.id}`)}
            />
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  page: { gap: space.md, paddingBottom: space.xxl, paddingTop: space.md },
});
