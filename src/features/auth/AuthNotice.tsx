import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Text } from '@/components';
import { space, useTheme } from '@/design';

interface AuthNoticeProps {
  message: string;
  tone?: 'error' | 'info';
}

/**
 * A form-level message.
 *
 * `alert` rather than plain text, so a screen reader announces it — a
 * sighted user sees the banner appear, and without the role nobody else does.
 */
export function AuthNotice({ message, tone = 'error' }: AuthNoticeProps) {
  const theme = useTheme();
  const isError = tone === 'error';

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <View
        accessible
        accessibilityRole="alert"
        style={[
          styles.notice,
          {
            backgroundColor: isError ? theme.colors.dangerWash : theme.colors.accentWash,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <Text variant="caption" color={isError ? 'danger' : 'inkSecondary'}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  notice: { paddingHorizontal: space.md, paddingVertical: space.sm },
});
