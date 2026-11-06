import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Switch, View } from 'react-native';

import { Button, Card, Chip, Icon, PressableScale, Screen, Text } from '@/components';
import { space, useTheme } from '@/design';
import { useCycle } from '@/features/cycle';
import {
  askPermission,
  DEFAULT_REMINDERS,
  loadReminderSettings,
  permission,
  saveReminderSettings,
  type Permission,
  type ReminderSettings,
  type TimeOfDay,
} from '@/features/reminders';

/**
 * Reminders.
 *
 * Each one off until she turns it on, and the permission prompt only appears
 * at that moment — asking at launch, before she knows what the app would send,
 * is how notification permission gets refused for good.
 */
export default function Reminders() {
  const router = useRouter();
  const { settings: cycle } = useCycle();

  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  const [allowed, setAllowed] = useState<Permission>('undetermined');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadReminderSettings(), permission()]).then(([loaded, state]) => {
      if (cancelled) return;
      setSettings(loaded);
      setAllowed(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = (next: ReminderSettings) => {
    setSettings(next);
    void saveReminderSettings(next);
  };

  /** Turning one on is when permission is asked for, and only then. */
  const enable = async <K extends keyof Omit<ReminderSettings, 'discreet'>>(
    key: K,
    on: boolean,
  ) => {
    if (on && allowed !== 'granted') {
      const answer = await askPermission();
      setAllowed(answer);
      if (answer !== 'granted') return;
    }
    save({ ...settings, [key]: { ...settings[key], enabled: on } });
  };

  const setTime = <K extends 'checkIn' | 'period' | 'fertile' | 'pill'>(key: K, time: TimeOfDay) =>
    save({ ...settings, [key]: { ...settings[key], ...time } });

  return (
    <Screen scroll padded>
      <View style={styles.page}>
        <View style={styles.header}>
          <PressableScale onPress={() => router.back()} accessibilityLabel="Back">
            <Icon name="chevron-left" size={28} color="ink" />
          </PressableScale>
          <Text variant="title2">Reminders</Text>
        </View>

        {allowed === 'unsupported' && (
          <Card tone="surface">
            <Text variant="callout" color="inkSecondary">
              Reminders need the app on a phone{Platform.OS === 'web' ? ' — not a browser' : ''}.
            </Text>
          </Card>
        )}

        {allowed === 'denied' && (
          <Card tone="periodWash">
            <Text variant="bodyMedium">Notifications are off for Diary</Text>
            <Text variant="callout" color="inkSecondary" style={styles.note}>
              They were turned off in your phone’s settings, so the app cannot ask again. Turn them
              on there and come back.
            </Text>
            <Button
              label="Open Settings"
              variant="secondary"
              size="small"
              onPress={() => void Linking.openSettings()}
              style={styles.note}
            />
          </Card>
        )}

        <Card>
          <Row
            title="Discreet"
            subtitle="Reminders say only that there is something to look at — never what. Lock screens are not private."
            value={settings.discreet}
            onChange={(discreet) => save({ ...settings, discreet })}
          />
        </Card>

        <Card>
          <Row
            icon="pencil-outline"
            title="A daily check-in"
            subtitle="A gentle nudge to write or log. Never a streak."
            value={settings.checkIn.enabled}
            onChange={(on) => void enable('checkIn', on)}
          />
          {settings.checkIn.enabled && (
            <TimeRow time={settings.checkIn} onChange={(time) => setTime('checkIn', time)} />
          )}
        </Card>

        {cycle.enabled && (
          <Card>
            <Row
              icon="water-outline"
              title="Before your period"
              subtitle="Based on your prediction, which can be wrong."
              value={settings.period.enabled}
              onChange={(on) => void enable('period', on)}
            />
            {settings.period.enabled && (
              <>
                <View style={styles.chips}>
                  {[1, 2, 3].map((days) => (
                    <Chip
                      key={days}
                      label={days === 1 ? 'The day before' : `${String(days)} days before`}
                      selected={settings.period.daysBefore === days}
                      onPress={() =>
                        save({ ...settings, period: { ...settings.period, daysBefore: days } })
                      }
                    />
                  ))}
                </View>
                <TimeRow time={settings.period} onChange={(time) => setTime('period', time)} />
              </>
            )}
          </Card>
        )}

        {cycle.enabled && (
          <Card>
            <Row
              icon="leaf"
              title="Your fertile window"
              subtitle="On the first day of the estimated window. Not contraception."
              value={settings.fertile.enabled}
              onChange={(on) => void enable('fertile', on)}
            />
            {settings.fertile.enabled && (
              <TimeRow time={settings.fertile} onChange={(time) => setTime('fertile', time)} />
            )}
          </Card>
        )}

        {cycle.enabled && cycle.onPill && (
          <Card>
            <Row
              icon="pill"
              title="Your pill"
              subtitle="Every day at the same time."
              value={settings.pill.enabled}
              onChange={(on) => void enable('pill', on)}
            />
            {settings.pill.enabled && (
              <TimeRow time={settings.pill} onChange={(time) => setTime('pill', time)} />
            )}
          </Card>
        )}

        <Card>
          <Row
            icon="email-open-outline"
            title="When a letter opens"
            subtitle="The morning a letter to yourself unseals."
            value={settings.letters.enabled}
            onChange={(on) => void enable('letters', on)}
          />
        </Card>

        <Card>
          <Row
            icon="history"
            title="Memories"
            subtitle="On a day you wrote something in an earlier year. Quiet dates are respected."
            value={settings.memories.enabled}
            onChange={(on) => void enable('memories', on)}
          />
        </Card>

        {!cycle.enabled && (
          <Text variant="caption" color="inkTertiary">
            Period, fertile window and pill reminders appear here when cycle tracking is on.
          </Text>
        )}
      </View>
    </Screen>
  );
}

function Row({
  icon,
  title,
  subtitle,
  value,
  onChange,
}: {
  icon?: string;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {icon !== undefined && (
        <View style={[styles.icon, { backgroundColor: theme.colors.accentWash }]}>
          <Icon name={icon} size={20} color="accent" />
        </View>
      )}
      <View style={styles.flex}>
        <Text variant="bodyMedium">{title}</Text>
        <Text variant="caption" color="inkTertiary">
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
        accessibilityLabel={title}
      />
    </View>
  );
}

/** A time, nudged a quarter of an hour at a time. */
function TimeRow({ time, onChange }: { time: TimeOfDay; onChange: (time: TimeOfDay) => void }) {
  const theme = useTheme();
  const shift = (minutes: number) => {
    const total = (time.hour * 60 + time.minute + minutes + 24 * 60) % (24 * 60);
    onChange({ hour: Math.floor(total / 60), minute: total % 60 });
  };
  const label = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;

  return (
    <View style={styles.time}>
      <Text variant="callout" color="inkSecondary" style={styles.flex}>
        At
      </Text>
      <PressableScale
        onPress={() => shift(-15)}
        accessibilityLabel="Fifteen minutes earlier"
        style={[styles.timeButton, { backgroundColor: theme.colors.surface }]}
      >
        <Icon name="minus" size={18} color="accent" />
      </PressableScale>
      <Text
        variant="title3"
        accessibilityLabel={`At ${label}`}
        style={styles.timeValue}
        align="center"
      >
        {label}
      </Text>
      <PressableScale
        onPress={() => shift(15)}
        accessibilityLabel="Fifteen minutes later"
        style={[styles.timeButton, { backgroundColor: theme.colors.surface }]}
      >
        <Icon name="plus" size={18} color="accent" />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  flex: { flex: 1, gap: 2 },
  header: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  icon: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  note: { marginTop: space.xs },
  page: { gap: space.md, paddingBottom: space.xxl, paddingTop: space.md },
  row: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  time: { alignItems: 'center', flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  timeButton: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  timeValue: { minWidth: 72 },
});
