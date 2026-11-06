import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import { useTheme, type Palette } from '@/design';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface IconProps {
  /** A MaterialCommunityIcons name. Strings from data are accepted and checked at the call site. */
  name: IconName | (string & {});
  size?: number;
  /** A palette token, so icons follow light and dark like text does. */
  color?: keyof Palette;
}

/**
 * The only icon component in the app.
 *
 * One family, used everywhere, so the tab bar, the log and the settings all
 * draw in the same hand. Icons are decorative by default — every one sits next
 * to a word or inside a control that already carries an accessibility label —
 * so they are hidden from screen readers rather than announced twice.
 */
export function Icon({ name, size = 22, color = 'ink' }: IconProps) {
  const theme = useTheme();
  return (
    <MaterialCommunityIcons
      name={name as IconName}
      size={size}
      color={theme.colors[color]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
