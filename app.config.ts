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
    /**
     * Deliberately NOT setting `UIFileSharingEnabled`.
     *
     * It is the obvious way to let somebody reach an exported folder — the
     * documents directory shows up in Files under On My iPhone — and it is
     * wrong here, because that same directory is where the diary's own videos,
     * photos and voice notes live. Turning it on would put every recording in
     * the app behind no lock at all, reachable by anyone who plugs the phone
     * into a computer, which is precisely what the PIN and the privacy cover
     * exist to prevent. An export is worth a lot; it is not worth that.
     *
     * The export reaches her through the share sheet instead, and media through
     * the photo library, which is the place on iOS she can already get at.
     */
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
    /**
     * Permission copy, written out rather than left to the defaults.
     *
     * iOS does not refuse a camera or microphone call that has no usage string
     * in the binary — it kills the app. Expo Go carries its own, so the absence
     * only shows up in the first real build, on the first tap of Record.
     *
     * The wording matters beyond compliance. This is the one sentence someone
     * reads before handing an app their camera, and the honest version of it is
     * short, says what the recording is for, and says where it goes. "Allow
     * Diary to access your camera" says none of that.
     */
    [
      'expo-camera',
      {
        cameraPermission:
          'Diary uses the camera only when you record a video entry. Your recordings stay in your diary.',
        microphonePermission:
          'Diary uses the microphone only while you are recording. Nothing is ever recorded in the background.',
        // Nothing in the app scans a barcode, and the scanner is a large chunk
        // of binary to carry for a feature a diary will never have.
        barcodeScannerEnabled: false,
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission:
          'Diary uses the microphone only when you are recording a voice note. Nothing is ever recorded in the background.',
        // Both deliberately off. Background recording is the capability a diary
        // should be least able to claim, and background playback would declare
        // an audio background mode the app has no use for.
        enableBackgroundRecording: false,
        enableBackgroundPlayback: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Diary asks for a photo only when you choose to attach one to an entry. It never reads the rest of your library.',
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
