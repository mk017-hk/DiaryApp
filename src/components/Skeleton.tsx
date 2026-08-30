import { useEffect } from 'react';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useMotion, useTheme } from '@/design';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Loading placeholder.
 *
 * A slow opacity breath rather than a sweeping shimmer — a shimmer draws the
 * eye and makes waiting feel longer. Static when Reduce Motion is on.
 */
export function Skeleton({ width = '100%', height = 16, radius, style, testID }: SkeletonProps) {
  const theme = useTheme();
  const motion = useMotion();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    if (motion.reduced) {
      pulse.value = 0.5;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [motion.reduced, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderRadius: radius ?? theme.radius.sm,
          height,
          width,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}
