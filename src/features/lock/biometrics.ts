import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

import { logger } from '@/services/logger';

/**
 * Biometric unlock — a shortcut past the PIN, never a replacement for it.
 *
 * `disableDeviceFallback: true` is the important line. Left at its default,
 * iOS falls back to the *device* passcode after a few failed scans, which
 * would quietly undo the whole point: a partner who knows your phone passcode
 * would be back inside your diary. Failing biometrics returns you to the app
 * PIN instead.
 *
 * Note for testing: Face ID does not work in Expo Go on iOS. The PIN path is
 * fully testable there; Face ID needs a development build.
 */

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'none';

export interface BiometricCapability {
  available: boolean;
  kind: BiometricKind;
  /** Hardware exists but nothing is enrolled — worth saying so in Settings. */
  enrolledNeeded: boolean;
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    if (!hasHardware) {
      return { available: false, kind: 'none', enrolledNeeded: false };
    }

    const kind: BiometricKind = types.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    )
      ? 'face'
      : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? 'fingerprint'
        : types.includes(LocalAuthentication.AuthenticationType.IRIS)
          ? 'iris'
          : 'none';

    return { available: isEnrolled, kind, enrolledNeeded: !isEnrolled };
  } catch (error) {
    logger.error('Could not read biometric capability', { error });
    return { available: false, kind: 'none', enrolledNeeded: false };
  }
}

/** The human name for whatever this device has. */
export function biometricLabel(kind: BiometricKind): string {
  switch (kind) {
    case 'face':
      return Platform.OS === 'ios' ? 'Face ID' : 'face unlock';
    case 'fingerprint':
      return Platform.OS === 'ios' ? 'Touch ID' : 'fingerprint';
    case 'iris':
      return 'iris unlock';
    case 'none':
      return 'biometrics';
  }
}

export async function authenticateWithBiometrics(kind: BiometricKind): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock your diary',
      cancelLabel: 'Use PIN',
      // See the note above: the app PIN is the fallback, not the phone passcode.
      disableDeviceFallback: true,
      requireConfirmation: false,
    });

    if (!result.success) {
      // `error` is a coarse reason code, never anything about the user.
      logger.info('Biometric unlock not completed', { reason: result.error });
    }

    return result.success;
  } catch (error) {
    logger.error(`Biometric unlock failed (${kind})`, { error });
    return false;
  }
}
