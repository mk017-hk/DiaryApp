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

// Notifications are a native module with no Jest build of its own. The wipe
// cancels them, so anything that imports it would otherwise fail to load.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
}));
