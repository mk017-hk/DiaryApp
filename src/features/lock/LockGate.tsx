import type { ReactNode } from 'react';

import { LockScreen } from './components/LockScreen';
import { PrivacyCover } from './components/PrivacyCover';
import { useAppLock } from './LockProvider';

/**
 * Stands between the app and its content.
 *
 * While the lock state is still `checking`, nothing renders — showing the
 * diary for even one frame before deciding would defeat the feature.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { state } = useAppLock();

  if (state === 'checking') return null;

  return <PrivacyCover>{state === 'locked' ? <LockScreen /> : children}</PrivacyCover>;
}
