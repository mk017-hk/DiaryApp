import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, PressableScale, Text } from '@/components';
import { space } from '@/design';
import { useSession } from '@/features/auth';
import { recentReflections, type Reflection } from '@/services/supabase/reflections';

import { dismissSupport, needsSupport, subscribeToReflections } from './queue';

/**
 * Today's card for the assistant's most recent notes.
 *
 * Or, if the last thing it read described someone in danger, the people to
 * talk to instead — in place of notes, never beside them.
 */
export function LatestNotes() {
  const router = useRouter();
  const { status } = useSession();
  const [latest, setLatest] = useState<Reflection | null>(null);
  const support = useSyncExternalStore(subscribeToReflections, needsSupport, needsSupport);
  const signedIn = status === 'signed-in';

  const load = useCallback(() => {
    if (!signedIn) return;
    void recentReflections(1).then((found) => setLatest(found[0] ?? null));
  }, [signedIn]);

  useEffect(() => {
    load();
    return subscribeToReflections(load);
  }, [load]);

  if (support) {
    return (
      <Card tone="accentWash">
        <PressableScale
          onPress={() => router.push('/support')}
          accessibilityLabel="People to talk to"
        >
          <Text variant="bodyMedium">If you want to talk to someone</Text>
          <Text variant="callout" color="inkSecondary">
            Something you wrote sounded like a lot to carry. There are people who can listen, any
            time.
          </Text>
        </PressableScale>
        <PressableScale
          onPress={dismissSupport}
          accessibilityLabel="Not now"
          style={styles.dismiss}
        >
          <Text variant="caption" color="inkTertiary">
            Not now
          </Text>
        </PressableScale>
      </Card>
    );
  }

  if (latest === null) return null;

  const first = latest.suggestions[0];

  return (
    <Card
      tone="accentWash"
      onPress={() => router.push(`/entry/${latest.entryId}`)}
      accessibilityLabel="Notes on your latest entry"
    >
      <View style={styles.header}>
        <Icon name="robot-outline" size={18} color="accent" />
        <Text variant="overline" color="accent">
          Notes on your latest entry
        </Text>
      </View>
      <Text variant="callout" numberOfLines={3} style={styles.notes}>
        {latest.notes}
      </Text>
      {first !== undefined && (
        <Text variant="caption" color="inkSecondary" numberOfLines={2}>
          {first.kind === 'write'
            ? 'To write about: '
            : first.kind === 'try'
              ? 'To try: '
              : 'To keep: '}
          {first.text}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  dismiss: { alignSelf: 'flex-end', paddingTop: space.xs },
  header: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  notes: { marginVertical: space.xs },
});
