import { StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components';
import { useTheme } from '@/design';

interface PinPadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  /** Rendered in the bottom-left slot, e.g. a Face ID shortcut. */
  accessory?: { label: string; onPress: () => void } | undefined;
  disabled?: boolean;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Numeric keypad.
 *
 * Deliberately not a TextInput: no system keyboard means no autocorrect, no
 * predictive bar, no clipboard, and nothing for a keyboard extension to see.
 */
export function PinPad({ onDigit, onDelete, accessory, disabled = false }: PinPadProps) {
  const theme = useTheme();

  const key = (content: React.ReactNode, onPress: () => void, label: string, key_: string) => (
    <PressableScale
      key={key_}
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      accessibilityLabel={label}
      ensureTouchTarget={false}
      style={[styles.key, { borderRadius: theme.radius.full }]}
    >
      {content}
    </PressableScale>
  );

  return (
    <View style={styles.pad}>
      {DIGITS.map((digit) =>
        key(
          <Text variant="title2" color="ink">
            {digit}
          </Text>,
          () => onDigit(digit),
          digit,
          digit,
        ),
      )}

      {accessory === undefined ? (
        <View style={styles.key} />
      ) : (
        key(
          <Text variant="caption" color="accent" numberOfLines={1}>
            {accessory.label}
          </Text>,
          accessory.onPress,
          `Unlock with ${accessory.label}`,
          'accessory',
        )
      )}

      {key(
        <Text variant="title2" color="ink">
          0
        </Text>,
        () => onDigit('0'),
        '0',
        '0',
      )}

      {key(
        <Text variant="callout" color="inkSecondary">
          Delete
        </Text>,
        onDelete,
        'Delete',
        'delete',
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  key: {
    alignItems: 'center',
    height: 72,
    justifyContent: 'center',
    width: '33.33%',
  },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    maxWidth: 320,
    width: '100%',
  },
});
