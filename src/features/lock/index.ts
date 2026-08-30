export { LockProvider, useAppLock } from './LockProvider';
export type { LockState, LockTimeout } from './LockProvider';

export { LockGate } from './LockGate';
export { LockScreen } from './components/LockScreen';
export { PrivacyCover } from './components/PrivacyCover';

export { authenticateWithBiometrics, biometricLabel, getBiometricCapability } from './biometrics';
export type { BiometricCapability, BiometricKind } from './biometrics';

export {
  clearPin,
  currentCooldown,
  isLockSupported,
  isPinSet,
  PIN_LENGTH,
  setPin,
  verifyPin,
} from './pinStorage';
export type { VerifyResult } from './pinStorage';
