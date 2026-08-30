import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/design';

import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  /** Serif headline. Warm and specific — never "No data". */
  title: string;
  /** One calm sentence. Optional; silence is often better than filler. */
  message?: string;
  action?: { label: string; onPress: () => void };
  testID?: string;
}

/**
 * Empty states are a first impression, not an error.
 *
 * A new user sees these before they see anything else, so they are written as
 * an invitation rather than a report of absence.
 */
export function EmptyState({ title, message, action, testID }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.root, { padding: theme.space.xl, gap: theme.space.sm }]} testID={testID}>
      <Text variant="title2" align="center">
        {title}
      </Text>
      {message !== undefined && (
        <Text variant="callout" color="inkSecondary" align="center" style={styles.message}>
          {message}
        </Text>
      )}
      {action !== undefined && (
        <View style={{ marginTop: theme.space.md }}>
          <Button label={action.label} onPress={action.onPress} variant="secondary" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  message: { maxWidth: 320 },
  root: { alignItems: 'center', flex: 1, justifyContent: 'center' },
});
