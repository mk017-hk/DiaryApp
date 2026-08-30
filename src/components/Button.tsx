import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design';

import { PressableScale } from './PressableScale';
import { Text, type TextColor } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'medium' | 'small';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Fills the available width. Primary actions usually should. */
  fullWidth?: boolean;
  /** Announced by screen readers instead of `label` when more context helps. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const theme = useTheme();

  const surfaces: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: theme.colors.accent },
    secondary: { backgroundColor: theme.colors.surface },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: theme.colors.dangerWash },
  };

  const labelColors: Record<ButtonVariant, TextColor> = {
    primary: 'onAccent',
    secondary: 'ink',
    ghost: 'accent',
    danger: 'danger',
  };

  const isBusy = loading || disabled;

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={isBusy}
      haptic={variant === 'primary' ? 'medium' : 'light'}
      accessibilityLabel={accessibilityLabel ?? label}
      {...(accessibilityHint !== undefined ? { accessibilityHint } : {})}
      accessibilityState={{ disabled: isBusy, busy: loading }}
      style={[
        styles.base,
        {
          height: size === 'small' ? theme.sizing.controlHeightSmall : theme.sizing.controlHeight,
          paddingHorizontal: size === 'small' ? theme.space.md : theme.space.lg,
          borderRadius: theme.radius.full,
        },
        surfaces[variant],
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {/* The label stays mounted while loading so the button cannot change
          width mid-press, which would move the target under the user's finger. */}
      <View style={styles.content}>
        <Text
          variant="label"
          color={labelColors[variant]}
          numberOfLines={1}
          style={loading ? styles.hidden : undefined}
        >
          {label}
        </Text>
        {loading && (
          <View style={StyleSheet.absoluteFill}>
            <View style={styles.content}>
              <ActivityIndicator
                size="small"
                color={variant === 'primary' ? theme.colors.onAccent : theme.colors.accent}
              />
            </View>
          </View>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  hidden: { opacity: 0 },
});
