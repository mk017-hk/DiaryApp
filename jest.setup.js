// Uses the manual mock in __mocks__/react-native-reanimated.js — see the note
// there for why the library's own mock cannot be used.
jest.mock('react-native-reanimated');

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn(),
  isLoaded: () => true,
}));

// AsyncStorage is a native module; its shipped mock stands in under Jest so
// any suite that touches stored state works without wiring one per file.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
