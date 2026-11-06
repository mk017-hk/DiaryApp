import { StyleSheet, View } from 'react-native';

import { Card, Icon, Text } from '@/components';
import { space } from '@/design';
import { VideoPoster } from '@/features/media';
import { fromDateKey, longDate } from '@/lib/date';

import type { Entry } from './entryStore';

/** Read once at load: only used to decide whether a date needs its year. */
const THIS_YEAR = new Date().getFullYear();

function dateLine(key: string): string {
  const date = fromDateKey(key);
  return date.getFullYear() === THIS_YEAR
    ? longDate(date)
    : `${longDate(date)} ${String(date.getFullYear())}`;
}

/**
 * An entry in a list: its date, its first lines, and a still if it has media.
 *
 * A still, never the clip. Streaming video to render a scrolling list is slow
 * here and expensive once it is coming from the account.
 */
export function EntryCard({ entry, onPress }: { entry: Entry; onPress: () => void }) {
  const first = entry.media[0];
  return (
    <Card onPress={onPress} accessibilityLabel={`Entry from ${dateLine(entry.entryDate)}`}>
      <View style={styles.row}>
        {first !== undefined && <VideoPoster item={first} />}
        <View style={styles.text}>
          <View style={styles.meta}>
            <Text variant="caption" color="inkTertiary">
              {dateLine(entry.entryDate)}
            </Text>
            {entry.isFavourite && <Icon name="bookmark" size={14} color="accent" />}
            {entry.isPersonal === true && (
              <Icon name="lock-outline" size={14} color="inkTertiary" />
            )}
          </View>
          <Text variant="body" numberOfLines={2}>
            {entry.body.length > 0 ? entry.body : 'A recorded moment'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  meta: { alignItems: 'center', flexDirection: 'row', gap: space.xxs },
  row: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  text: { flex: 1, gap: 2 },
});
