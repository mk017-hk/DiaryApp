import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space, useTheme, type Palette } from '@/design';

import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: string;
  /** The tint behind the icon. */
  iconTone?: Extract<keyof Palette, 'accentWash' | 'periodWash' | 'fertileWash' | 'surface'>;
  onPress?: () => void;
  /** Replaces the chevron: a switch, a value, a badge. */
  trailing?: ReactNode;
  destructive?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * A row in a settings-style list: an icon in a soft circle, a title, an
 * optional line under it, and a chevron when it goes somewhere.
 */
export function ListRow({
  title,
  subtitle,
  icon,
  iconTone = 'accentWash',
  onPress,
  trailing,
  destructive = false,
  accessibilityLabel,
  testID,
}: ListRowProps) {
  const theme = useTheme();

  const body = (
    <>
      {icon !== undefined && (
        <View style={[styles.iconWell, { backgroundColor: theme.colors[iconTone] }]}>
          <Icon name={icon} size={20} color={destructive ? 'danger' : 'accent'} />
        </View>
      )}
      <View style={styles.text}>
        <Text variant="bodyMedium" color={destructive ? 'danger' : 'ink'}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text variant="caption" color="inkTertiary">
            {subtitle}
          </Text>
        )}
      </View>
      {trailing ?? (onPress !== undefined && <Icon name="chevron-right" color="inkFaint" />)}
    </>
  );

  if (onPress === undefined) {
    return (
      <View style={styles.row} testID={testID}>
        {body}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={styles.row}
      testID={testID}
    >
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  iconWell: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 56,
    paddingVertical: space.xs,
  },
  text: { flex: 1, gap: 2 },
});
