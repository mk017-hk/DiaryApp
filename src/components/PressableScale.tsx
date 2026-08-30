import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { sizing, useMotion, useTheme } from '@/design';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Haptic fired on press-in. `none` for high-frequency controls. */
  haptic?: 'none' | 'light' | 'medium' | 'selection';
  /** Ensures the touch target reaches 44pt even when the visual is smaller. */
  ensureTouchTarget?: boolean;
}

/**
 * The base interactive element.
 *
 * Gives every control the same press feel: a small settle rather than a bounce,
 * an optional haptic, and a guaranteed 44pt touch target. Honours Reduce Motion
 * by fading opacity instead of scaling.
 */
export function PressableScale({
  children,
  style,
  haptic = 'light',
  ensureTouchTarget = true,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableScaleProps) {
  const theme = useTheme();
  const motion = useMotion();
  const pressed = useSharedValue(0);

  const isDisabled = disabled === true;

  // The disabled dim has to be computed inside the worklet. Reanimated applies
  // animated styles imperatively, so a static `{ opacity: 0.4 }` further along
  // the style array is silently overridden and the control looks enabled.
  const animatedStyle = useAnimatedStyle(() => {
    const restingOpacity = isDisabled ? 0.4 : 1;

    if (motion.reduced) {
      return {
        opacity: withTiming(pressed.value === 1 ? restingOpacity * 0.6 : restingOpacity, {
          duration: 0,
        }),
      };
    }

    return {
      transform: [
        {
          scale: withSpring(
            pressed.value === 1 && !isDisabled ? theme.motion.pressScale : 1,
            theme.motion.spring.snappy,
          ),
        },
      ],
      opacity: withTiming(pressed.value === 1 ? restingOpacity * 0.9 : restingOpacity, {
        duration: theme.motion.duration.instant,
      }),
    };
  });

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={disabled}
      hitSlop={ensureTouchTarget ? hitSlopFor(sizing.minTouchTarget) : undefined}
      onPressIn={(event) => {
        pressed.value = 1;
        if (haptic !== 'none') {
          void triggerHaptic(haptic);
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.value = 0;
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

const hitSlopFor = (target: number) => {
  const slop = Math.round(target / 4);
  return { top: slop, bottom: slop, left: slop, right: slop };
};

async function triggerHaptic(kind: Exclude<PressableScaleProps['haptic'], 'none' | undefined>) {
  try {
    if (kind === 'selection') {
      await Haptics.selectionAsync();
      return;
    }
    await Haptics.impactAsync(
      kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
  } catch {
    // Haptics are unavailable on some devices and in simulators. Never let a
    // missing motor break a press.
  }
}
