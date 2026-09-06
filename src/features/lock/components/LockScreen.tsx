import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen, Text } from '@/components';
import { useTheme } from '@/design';

import {
  authenticateWithBiometrics,
  biometricLabel,
  getBiometricCapability,
  type BiometricCapability,
} from '../biometrics';
import { useAppLock } from '../LockProvider';
import { currentCooldown, PIN_LENGTH } from '../pinStorage';
import { PinPad } from './PinPad';

/**
 * The unlock screen.
 *
 * Says nothing about whose diary this is or what is inside — someone holding
 * the phone should learn nothing from the lock screen itself.
 */
export function LockScreen() {
  const theme = useTheme();
  const { unlockWithPin, unlockWithBiometrics, biometricsEnabled } = useAppLock();

  const [entry, setEntry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [checking, setChecking] = useState(false);

  const tryBiometrics = useCallback(async () => {
    const ok = await authenticateWithBiometrics(capability?.kind ?? 'none');
    if (ok) unlockWithBiometrics();
  }, [capability, unlockWithBiometrics]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [found, remaining] = await Promise.all([getBiometricCapability(), currentCooldown()]);
      if (cancelled) return;

      setCapability(found);
      setCooldown(remaining);

      // Offer the scan immediately — an extra tap before every unlock is what
      // makes people turn the lock off.
      if (found.available && biometricsEnabled && remaining === 0) {
        void tryBiometrics();
      }
    })();

    return () => {
      cancelled = true;
    };
    // Runs once on mount; tryBiometrics is stable enough for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const submit = useCallback(
    async (pin: string) => {
      setChecking(true);
      const result = await unlockWithPin(pin);
      setChecking(false);

      if (result.ok) return;

      setEntry('');
      if (result.cooldownSeconds > 0) {
        setCooldown(result.cooldownSeconds);
        setError('Too many attempts.');
      } else {
        setError(
          result.attemptsRemaining > 0
            ? `Incorrect PIN. ${String(result.attemptsRemaining)} attempts left.`
            : 'Incorrect PIN.',
        );
      }
    },
    [unlockWithPin],
  );

  const onDigit = useCallback(
    (digit: string) => {
      if (cooldown > 0 || checking) return;
      setError(null);

      setEntry((current) => {
        const next = current.length >= PIN_LENGTH ? current : current + digit;
        if (next.length === PIN_LENGTH) void submit(next);
        return next;
      });
    },
    [cooldown, checking, submit],
  );

  const onDelete = useCallback(() => {
    setError(null);
    setEntry((current) => current.slice(0, -1));
  }, []);

  const showBiometrics =
    capability?.available === true && biometricsEnabled && cooldown === 0 && !checking;

  return (
    <Screen padded>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text variant="title2" align="center">
            Welcome back
          </Text>
          <Text variant="callout" color="inkSecondary" align="center">
            Enter your PIN to continue
          </Text>
        </View>

        <View
          style={styles.dots}
          accessibilityRole="progressbar"
          accessibilityLabel={`${String(entry.length)} of ${String(PIN_LENGTH)} digits entered`}
        >
          {Array.from({ length: PIN_LENGTH }, (_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index < entry.length ? theme.colors.accent : theme.colors.surfaceMuted,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.message} accessibilityLiveRegion="polite">
          {cooldown > 0 ? (
            <Text variant="caption" color="danger" align="center" accessibilityRole="alert">
              Try again in {formatCooldown(cooldown)}
            </Text>
          ) : error !== null ? (
            <Text variant="caption" color="danger" align="center" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>

        <PinPad
          onDigit={onDigit}
          onDelete={onDelete}
          disabled={cooldown > 0 || checking}
          accessory={
            showBiometrics
              ? { label: biometricLabel(capability.kind), onPress: () => void tryBiometrics() }
              : undefined
          }
        />
      </View>
    </Screen>
  );
}

function formatCooldown(seconds: number): string {
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${String(minutes)} minute${minutes === 1 ? '' : 's'}`;
}

const styles = StyleSheet.create({
  dot: { borderRadius: 7, height: 14, width: 14 },
  dots: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  header: { gap: 8 },
  message: { minHeight: 20, justifyContent: 'center' },
  root: { alignItems: 'center', flex: 1, gap: 32, justifyContent: 'center' },
});
