import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme, type Palette, type TextVariant } from '@/design';

/** Palette keys that are legitimate text colours. */
export type TextColor = Extract<
  keyof Palette,
  'ink' | 'inkSecondary' | 'inkTertiary' | 'inkFaint' | 'accent' | 'danger' | 'success' | 'onAccent'
>;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: TextColor;
  align?: TextStyle['textAlign'];
  /** Overrides the variant's line height. Use for tightly-set display text. */
  lineHeight?: number;
}

/**
 * The only text component in the app.
 *
 * Raw <Text> from react-native is deliberately not used anywhere else: routing
 * everything through variants is what keeps typography consistent, and it
 * guarantees Dynamic Type scaling is never accidentally disabled.
 */
export function Text({
  variant = 'body',
  color = 'ink',
  align,
  lineHeight,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  return (
    <RNText
      style={[
        theme.text[variant],
        { color: theme.colors[color] },
        align !== undefined && { textAlign: align },
        lineHeight !== undefined && { lineHeight },
        style,
      ]}
      {...rest}
    />
  );
}
