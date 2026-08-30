import { useId, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/design';

import { Text } from './Text';

export interface FieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label: string;
  /** Validation message. Presence switches the field into its error styling. */
  error?: string;
  /** Persistent guidance shown below the field when there is no error. */
  hint?: string;
  /** Visually hides the label but keeps it for screen readers. */
  hideLabel?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Text input.
 *
 * Focus and error are shown with tone changes rather than heavy outlines, and
 * the error text is wired to the input via accessibility props so screen
 * readers announce the problem rather than leaving it purely visual.
 */
export function Field({
  label,
  error,
  hint,
  hideLabel = false,
  containerStyle,
  multiline,
  ...rest
}: FieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const errorId = useId();

  const hasError = error !== undefined && error.length > 0;

  return (
    <View style={[{ gap: theme.space.xs }, containerStyle]}>
      {!hideLabel && (
        <Text variant="label" color="inkSecondary">
          {label}
        </Text>
      )}

      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        aria-errormessage={hasError ? errorId : undefined}
        aria-invalid={hasError}
        placeholderTextColor={theme.colors.inkFaint}
        onFocus={(event) => {
          setFocused(true);
          rest.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          rest.onBlur?.(event);
        }}
        multiline={multiline}
        style={[
          theme.text.body,
          styles.input,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: hasError
              ? theme.colors.danger
              : focused
                ? theme.colors.accentSoft
                : 'transparent',
            borderRadius: theme.radius.md,
            color: theme.colors.ink,
            minHeight: multiline === true ? 120 : theme.sizing.controlHeight,
            paddingHorizontal: theme.space.md,
            paddingVertical: theme.space.sm,
            textAlignVertical: multiline === true ? 'top' : 'center',
          },
        ]}
        {...rest}
      />

      {hasError ? (
        <Text nativeID={errorId} variant="caption" color="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : hint !== undefined ? (
        <Text variant="caption" color="inkTertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1 },
});
