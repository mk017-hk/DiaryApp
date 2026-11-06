import { StyleSheet, View } from 'react-native';

import { space } from '@/design';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

/** A section's title, with an optional "See all" on the right. */
export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant="title3" accessibilityRole="header">
        {title}
      </Text>
      {action !== undefined && (
        <PressableScale onPress={action.onPress} haptic="light" accessibilityLabel={action.label}>
          <Text variant="label" color="accent">
            {action.label}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
});
