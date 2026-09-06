import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Only values that are safe to ship inside the app binary belong here.
 * The Supabase anon key is designed for client distribution and is protected by
 * Row Level Security. The service role key must NEVER appear in this file, in
 * `extra`, or anywhere else in the mobile bundle.
 *
 * Icon and splash artwork are intentionally absent until the brand exists —
 * Expo's defaults are used meanwhile rather than committing placeholder art.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Diary',
  slug: 'diaryapp',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'diary',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.mk017hk.diaryapp',
    config: {
      usesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.mk017hk.diaryapp',
  },
  web: {
    bundler: 'metro',
    output: 'static',
  },
  plugins: [
    'expo-router',
    'expo-font',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FBF8F5',
        dark: { backgroundColor: '#14110F' },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
});
