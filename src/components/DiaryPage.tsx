import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design';

interface DiaryPageProps {
  children?: ReactNode;
  /** Draws the notebook margin rule down the left edge. */
  ruled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A page of the diary.
 *
 * The margin rule is the whole trick. One warm vertical line at a notebook's
 * margin, and the eye reads paper instead of a form — no skeuomorphic leather,
 * no fake stitching, just the one detail a real page has that an app screen
 * does not. Everything written inside sits to the right of it, the way it
 * would in a book.
 */
export function DiaryPage({ children, ruled = true, style }: DiaryPageProps) {
  const theme = useTheme();

  return (
    <View style={[styles.page, { backgroundColor: theme.colors.canvas }, style]}>
      {ruled && (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.margin, { backgroundColor: theme.colors.accentSoft }]}
        />
      )}
      <View style={[styles.content, ruled && styles.contentInset]}>{children}</View>
    </View>
  );
}

const MARGIN_LEFT = 28;

const styles = StyleSheet.create({
  content: { flex: 1 },
  contentInset: { paddingLeft: MARGIN_LEFT + 16 },
  margin: {
    bottom: 0,
    left: MARGIN_LEFT,
    opacity: 0.35,
    position: 'absolute',
    top: 0,
    width: 1,
  },
  page: { flex: 1 },
});
