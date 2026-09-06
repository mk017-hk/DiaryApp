import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Chip, Divider, Screen, Text } from '@/components';
import { space, useTheme } from '@/design';
import {
  PIN_LENGTH,
  biometricLabel,
  getBiometricCapability,
  useAppLock,
  type BiometricCapability,
  type LockTimeout,
} from '@/features/lock';
import { PinPad } from '@/features/lock/components/PinPad';

/**
 * App lock settings, and the PIN setup flow.
 *
 * Temporarily a top-level route so the lock is reachable before Settings
 * exists; it moves under Settings in a later phase.
 */
export default function SecurityScreen() {
  const router = useRouter();
  const theme = useTheme();
  const {
    state,
    timeout,
    biometricsEnabled,
    enableLock,
    disableLock,
    lockNow,
    setTimeout,
    setBiometricsEnabled,
  } = useAppLock();

  const [stage, setStage] = useState<'idle' | 'choose' | 'confirm'>('idle');
  const [firstPin, setFirstPin] = useState('');
  const [entry, setEntry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [capability, setCapability] = useState<BiometricCapability | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getBiometricCapability().then((found) => {
      if (!cancelled) setCapability(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reset = useCallback(() => {
    setStage('idle');
    setFirstPin('');
    setEntry('');
    setError(null);
  }, []);

  const onDigit = useCallback(
    (digit: string) => {
      setError(null);
      setEntry((current) => {
        if (current.length >= PIN_LENGTH) return current;
        const next = current + digit;
        if (next.length < PIN_LENGTH) return next;

        if (stage === 'choose') {
          setFirstPin(next);
          setStage('confirm');
          return '';
        }

        if (next === firstPin) {
          void enableLock(next).then(reset);
          return '';
        }

        setError("Those didn't match. Start again.");
        setFirstPin('');
        setStage('choose');
        return '';
      });
    },
    [stage, firstPin, enableLock, reset],
  );

  if (stage !== 'idle') {
    return (
      <Screen padded>
        <View style={styles.setup}>
          <View style={styles.header}>
            <Text variant="title2" align="center">
              {stage === 'choose' ? 'Choose a PIN' : 'Enter it again'}
            </Text>
            <Text variant="callout" color="inkSecondary" align="center" style={styles.blurb}>
              {stage === 'choose'
                ? 'Six digits. Make it different from your phone passcode — that is the point of it.'
                : 'Just to be sure you will remember it.'}
            </Text>
          </View>

          <View style={styles.dots}>
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
            {error !== null && (
              <Text variant="caption" color="danger" align="center" accessibilityRole="alert">
                {error}
              </Text>
            )}
          </View>

          <PinPad onDigit={onDigit} onDelete={() => setEntry((c) => c.slice(0, -1))} />

          <Button label="Cancel" onPress={reset} variant="ghost" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll padded>
      <View style={styles.page}>
        <Text variant="title1">App lock</Text>
        <Text variant="callout" color="inkSecondary">
          A PIN keeps your diary closed when someone else is holding your phone. It is separate from
          your phone passcode on purpose.
        </Text>

        <Divider />

        {state === 'disabled' ? (
          <Button label="Set up a PIN" onPress={() => setStage('choose')} fullWidth />
        ) : (
          <View style={styles.section}>
            <Text variant="bodyMedium">App lock is on</Text>

            <Text variant="overline" color="inkTertiary">
              Lock after
            </Text>
            <View style={styles.row}>
              {(['immediately', '1m', '5m', '15m'] as LockTimeout[]).map((option) => (
                <Chip
                  key={option}
                  label={timeoutLabel(option)}
                  selected={timeout === option}
                  onPress={() => void setTimeout(option)}
                />
              ))}
            </View>

            {capability?.available === true && (
              <>
                <Text variant="overline" color="inkTertiary">
                  {biometricLabel(capability.kind)}
                </Text>
                <View style={styles.row}>
                  <Chip
                    label={biometricsEnabled ? 'On' : 'Off'}
                    selected={biometricsEnabled}
                    onPress={() => void setBiometricsEnabled(!biometricsEnabled)}
                  />
                </View>
              </>
            )}

            {capability?.enrolledNeeded === true && (
              <Text variant="caption" color="inkTertiary">
                Nothing is enrolled on this device, so the PIN is the only way in.
              </Text>
            )}

            <Divider />

            <Button label="Lock now" onPress={lockNow} variant="secondary" fullWidth />
            <Button
              label="Turn off app lock"
              onPress={() => void disableLock()}
              variant="danger"
              fullWidth
            />
          </View>
        )}

        <Divider />

        <Text variant="caption" color="inkTertiary">
          The lock guards this device. It is not encryption, and someone who knows your account
          password could still sign in elsewhere. If you forget the PIN, sign out and back in.
        </Text>

        <Button label="Back" onPress={() => router.back()} variant="ghost" />
      </View>
    </Screen>
  );
}

function timeoutLabel(value: LockTimeout): string {
  switch (value) {
    case 'immediately':
      return 'Immediately';
    case '1m':
      return '1 minute';
    case '5m':
      return '5 minutes';
    case '15m':
      return '15 minutes';
  }
}

const styles = StyleSheet.create({
  blurb: { maxWidth: 320 },
  dot: { borderRadius: 7, height: 14, width: 14 },
  dots: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  header: { gap: space.xs },
  message: { justifyContent: 'center', minHeight: 20 },
  page: { gap: space.md, paddingTop: space.xl },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  section: { gap: space.sm },
  setup: { alignItems: 'center', flex: 1, gap: space.lg, justifyContent: 'center' },
});
