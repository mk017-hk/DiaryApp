import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { Button, Card, Icon, PressableScale, Screen, Stepper, Text } from '@/components';
import { space, useTheme } from '@/design';
import { clearDayLogs, CYCLE_LENGTH_RANGE, PERIOD_LENGTH_RANGE, useCycle } from '@/features/cycle';

/**
 * Cycle tracking, switched on and shaped.
 *
 * Off is a complete answer: nothing about the cycle appears anywhere in the
 * app, and the circle on Today goes back to holding the day's question.
 * Switching off does not delete anything — that is a separate, explicit act at
 * the bottom of the page, because "stop showing me this" and "destroy this"
 * are different sentences.
 */
export default function CycleSettings() {
  const router = useRouter();
  const theme = useTheme();
  const { settings, updateSettings, summary, periods } = useCycle();

  const forget = () =>
    Alert.alert(
      'Delete your cycle data?',
      'Every period, symptom and log on this phone, and in your account once it next syncs. Your diary entries are not touched. This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void clearDayLogs(),
        },
      ],
    );

  return (
    <Screen scroll padded>
      <View style={styles.page}>
        <View style={styles.header}>
          <PressableScale onPress={() => router.back()} accessibilityLabel="Back">
            <Icon name="chevron-left" size={28} color="ink" />
          </PressableScale>
          <Text variant="title2">Cycle tracking</Text>
        </View>

        <Card>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text variant="bodyMedium">Track my cycle</Text>
              <Text variant="caption" color="inkTertiary">
                Periods, predictions, and how your logs line up with your cycle.
              </Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={(enabled) => void updateSettings({ enabled })}
              trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
              accessibilityLabel="Track my cycle"
            />
          </View>
        </Card>

        {settings.enabled && (
          <>
            <Card>
              <Text variant="overline" color="inkTertiary">
                Usually
              </Text>
              <View style={styles.steppers}>
                <Stepper
                  label="Cycle"
                  unit="days"
                  value={settings.cycleLength}
                  onChange={(value) =>
                    value !== undefined && void updateSettings({ cycleLength: value })
                  }
                  min={CYCLE_LENGTH_RANGE.min}
                  max={CYCLE_LENGTH_RANGE.max}
                />
                <Stepper
                  label="Period"
                  unit={settings.periodLength === 1 ? 'day' : 'days'}
                  value={settings.periodLength}
                  onChange={(value) =>
                    value !== undefined && void updateSettings({ periodLength: value })
                  }
                  min={PERIOD_LENGTH_RANGE.min}
                  max={PERIOD_LENGTH_RANGE.max}
                />
              </View>
              <Text variant="caption" color="inkTertiary" style={styles.note}>
                {summary.learned
                  ? `Predictions now use your own average of ${String(summary.averageCycle)} days. These are only used until there is a logged cycle to learn from.`
                  : 'Used until you have logged a full cycle. After that, predictions use your own average.'}
              </Text>
            </Card>

            <Card>
              <View style={styles.switchRow}>
                <View style={styles.flex}>
                  <Text variant="bodyMedium">I take the pill</Text>
                  <Text variant="caption" color="inkTertiary">
                    Adds a pill row to the daily log, and a reminder you can turn on.
                  </Text>
                </View>
                <Switch
                  value={settings.onPill}
                  onValueChange={(onPill) => void updateSettings({ onPill })}
                  trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                  accessibilityLabel="I take the pill"
                />
              </View>
            </Card>

            <Button
              label={periods.length === 0 ? 'Log your last period' : 'Edit period dates'}
              variant="secondary"
              onPress={() => router.push('/period')}
              fullWidth
            />
          </>
        )}

        <Card tone="surface">
          <Text variant="bodyMedium">Where this lives</Text>
          <Text variant="callout" color="inkSecondary" style={styles.note}>
            Cycle data is kept on this phone and, when you are signed in, in your own account. It is
            never part of a shared diary, never read by the assistant, and never sold or used for
            advertising.
          </Text>
          <Text variant="callout" color="inkSecondary" style={styles.note}>
            Predictions are estimates from the dates you log. They are not contraception and cannot
            tell you whether you are pregnant.
          </Text>
        </Card>

        <Button label="Delete my cycle data" variant="danger" onPress={forget} fullWidth />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  header: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  note: { marginTop: space.xs },
  page: { gap: space.md, paddingBottom: space.xxl, paddingTop: space.md },
  steppers: { gap: space.sm, marginTop: space.sm },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
});
