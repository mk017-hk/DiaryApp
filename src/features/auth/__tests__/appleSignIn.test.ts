/**
 * When the Sign in with Apple button is shown.
 *
 * The rule that matters here is the build flag. iOS reports Sign in with Apple
 * as available on any modern iPhone, whether or not this particular build is
 * entitled to use it — so without the flag, a build made with a free Apple ID
 * would show a button that fails the moment it is tapped.
 */

import { isAppleSignInAvailable } from '../appleSignIn';

let mockExtra: Record<string, unknown> = {};
let mockEnvironment = 'bare';
let mockAvailable = true;

jest.mock('expo-constants', () => ({
  __esModule: true,
  ExecutionEnvironment: { StoreClient: 'storeClient', Bare: 'bare' },
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
    get executionEnvironment() {
      return mockEnvironment;
    },
  },
}));
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: () => Promise.resolve(mockAvailable),
}));
jest.mock('@/services/supabase/auth', () => ({ signInWithApple: jest.fn() }));

beforeEach(() => {
  mockExtra = { appleSignIn: true };
  mockEnvironment = 'bare';
  mockAvailable = true;
});

it('shows the button in a build made with Apple sign-in', async () => {
  expect(await isAppleSignInAvailable()).toBe(true);
});

it('hides it in a build made without, even though iOS says it is available', async () => {
  mockExtra = { appleSignIn: false };

  expect(await isAppleSignInAvailable()).toBe(false);
});

// The default, and what every build gets until APPLE_SIGN_IN=1 is set.
it('hides it when the build says nothing either way', async () => {
  mockExtra = {};

  expect(await isAppleSignInAvailable()).toBe(false);
});

it('hides it in Expo Go, where the token is signed for the wrong app', async () => {
  mockEnvironment = 'storeClient';

  expect(await isAppleSignInAvailable()).toBe(false);
});

it('hides it where iOS itself says no', async () => {
  mockAvailable = false;

  expect(await isAppleSignInAvailable()).toBe(false);
});
