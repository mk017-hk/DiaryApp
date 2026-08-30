import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/design';

import { Button } from './Button';
import { Text } from './Text';

export interface ErrorStateProps {
  /** Plain-language headline. Never an error code. */
  title?: string;
  /**
   * A message already made safe for display. Raw backend errors must never be
   * passed here — map them through `toUserMessage()` first, or they will leak
   * table names, constraint names and query shapes to the user.
   */
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  testID?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'Your entries are safe. Please try again in a moment.',
  onRetry,
  retryLabel = 'Try again',
  testID,
}: ErrorStateProps) {
  const theme = useTheme();

  return (
    <View
      style={[styles.root, { padding: theme.space.xl, gap: theme.space.sm }]}
      testID={testID}
      // `accessible` is what makes this an announced region rather than a
      // silent container — the role alone is not enough on either platform.
      accessible
      accessibilityRole="alert"
    >
      <Text variant="title3" align="center">
        {title}
      </Text>
      <Text variant="callout" color="inkSecondary" align="center" style={styles.message}>
        {message}
      </Text>
      {onRetry !== undefined && (
        <View style={{ marginTop: theme.space.md }}>
          <Button label={retryLabel} onPress={onRetry} variant="secondary" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  message: { maxWidth: 320 },
  root: { alignItems: 'center', flex: 1, justifyContent: 'center' },
});
