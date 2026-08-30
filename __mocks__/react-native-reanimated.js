/**
 * Manual mock for Reanimated 4.
 *
 * Reanimated 4 loads `react-native-worklets`, which reaches for a native module
 * that does not exist under Jest — and its own shipped mock imports the real
 * entry point, so it fails the same way. This stands in for the surface the app
 * actually uses: animated components render as plain views and animation
 * helpers resolve to their target values synchronously.
 */
const React = require('react');
const { View, Text, ScrollView, FlatList, Image } = require('react-native');

const identity = (value) => value;

const createAnimatedComponent = (Component) => {
  const Animated = React.forwardRef((props, ref) =>
    React.createElement(Component, { ...props, ref }),
  );
  Animated.displayName = `Animated(${Component.displayName || Component.name || 'Component'})`;
  return Animated;
};

const Animated = {
  View,
  Text,
  ScrollView,
  FlatList,
  Image,
  createAnimatedComponent,
};

const bezier = () => identity;

const Easing = {
  bezier,
  linear: identity,
  ease: identity,
  in: identity,
  out: identity,
  inOut: identity,
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,

  Easing,

  // Shared values behave as plain mutable boxes, which is enough for assertions
  // about what a component does with them.
  useSharedValue: (initial) => ({ value: initial }),
  useDerivedValue: (fn) => ({ value: fn() }),
  useAnimatedStyle: (fn) => fn(),
  useAnimatedRef: () => ({ current: null }),
  useAnimatedScrollHandler: () => () => {},
  useReducedMotion: () => false,

  // Animation helpers resolve immediately to their target.
  withTiming: identity,
  withSpring: identity,
  withDelay: (_delay, value) => value,
  withRepeat: identity,
  withSequence: (...values) => values[values.length - 1],
  cancelAnimation: () => {},

  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,

  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
  Layout: { springify: () => ({}) },
};
