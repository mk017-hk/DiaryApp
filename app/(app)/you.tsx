import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, ListRow, PressableScale, SectionHeader, Text } from '@/components';
import { space, useTheme, useThemePreference, type ThemePreference } from '@/design';
import { useSession } from '@/features/auth';
import { useCycle } from '@/features/cycle';
import { useSync } from '@/features/entries';
import { useProfile } from '@/features/profile';

const APPEARANCE: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'Match phone' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/**
 * You.
 *
 * Everything that belongs to you rather than to a day. Grouped by what it is
 * for, with the support row kept high and never behind anything — the whole
 * point of it is that somebody can reach it on a bad afternoon without hunting.
 */
export default function You() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { name } = useProfile();
  const { status, user } = useSession();
  const { state, pending } = useSync();
  const { settings } = useCycle();
  const { preference, setPreference } = useThemePreference();

  const accountLine =
    status === 'signed-in'
      ? (user?.email ?? 'Signed in')
      : status === 'unavailable'
        ? 'Your diary lives on this phone only'
        : 'Not signed in';

  const syncLine =
    status !== 'signed-in'
      ? null
      : pending > 0
        ? `${String(pending)} waiting to send`
        : state === 'offline'
          ? 'Offline — saved on this phone'
          : 'Everything saved to your account';

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.canvas }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Who ──────────────────────────────────────────── */}
        <Card onPress={() => router.push('/account')} accessibilityLabel="Your account">
          <View style={styles.profile}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.accent }]}>
              <Text variant="title2" color="onAccent">
                {name.length > 0 ? name.charAt(0).toUpperCase() : '·'}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text variant="title3">{name.length > 0 ? name : 'You'}</Text>
              <Text variant="caption" color="inkTertiary">
                {accountLine}
              </Text>
              {syncLine !== null && (
                <Text variant="caption" color="inkTertiary">
                  {syncLine}
                </Text>
              )}
            </View>
          </View>
        </Card>

        <Card tone="accentWash">
          <ListRow
            icon="lifebuoy"
            iconTone="surface"
            title="If you need someone"
            subtitle="People to talk to, any time"
            onPress={() => router.push('/support')}
          />
        </Card>

        {/* ── Cycle ────────────────────────────────────────── */}
        <View>
          <SectionHeader title="Cycle" />
          <Card>
            <ListRow
              icon="sync"
              iconTone="periodWash"
              title="Cycle tracking"
              subtitle={
                settings.enabled
                  ? `On · ${String(settings.cycleLength)}-day cycle, ${String(settings.periodLength)}-day period`
                  : 'Off'
              }
              onPress={() => router.push('/cycle-settings')}
            />
            <ListRow
              icon="bell-outline"
              title="Reminders"
              subtitle="Check-ins, your period, letters"
              onPress={() => router.push('/reminders')}
            />
          </Card>
        </View>

        {/* ── Diary ────────────────────────────────────────── */}
        <View>
          <SectionHeader title="Your diary" />
          <Card>
            <ListRow
              icon="email-edit-outline"
              title="Letters to yourself"
              subtitle="Sealed until the day you choose"
              onPress={() => router.push('/letters')}
            />
            <ListRow
              icon="book-multiple-outline"
              title="Threads"
              onPress={() => router.push('/threads')}
            />
            <ListRow icon="bookmark-outline" title="Saved" onPress={() => router.push('/saved')} />
            <ListRow
              icon="weather-sunset-up"
              title="Quiet dates"
              subtitle="Days you would rather not be reminded of"
              onPress={() => router.push('/quiet-dates')}
            />
          </Card>
        </View>

        {/* ── Privacy ──────────────────────────────────────── */}
        <View>
          <SectionHeader title="Privacy" />
          <Card>
            <ListRow
              icon="shield-lock-outline"
              title="App lock"
              subtitle="Passcode and Face ID"
              onPress={() => router.push('/security')}
            />
            <ListRow
              icon="account-multiple-outline"
              title="Sharing"
              subtitle="A diary kept with someone else"
              onPress={() => router.push('/sharing')}
            />
            <ListRow
              icon="export-variant"
              title="Take a copy of everything"
              onPress={() => router.push('/export')}
            />
          </Card>
        </View>

        {/* ── Appearance ───────────────────────────────────── */}
        <View>
          <SectionHeader title="Appearance" />
          <View
            style={[styles.segment, { backgroundColor: theme.colors.surface }]}
            accessibilityRole="radiogroup"
          >
            {APPEARANCE.map((option) => {
              const active = preference === option.id;
              return (
                <PressableScale
                  key={option.id}
                  onPress={() => setPreference(option.id)}
                  haptic="selection"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={option.label}
                  style={[styles.segmentOption, active && { backgroundColor: theme.colors.card }]}
                >
                  <Text variant="label" color={active ? 'ink' : 'inkSecondary'}>
                    {option.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {/* ── Account ──────────────────────────────────────── */}
        <Card>
          <ListRow
            icon="account-circle-outline"
            title="Account"
            subtitle={status === 'signed-in' ? 'Sign out, or delete your account' : accountLine}
            onPress={() => router.push('/account')}
          />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  content: { gap: space.lg, paddingBottom: space.xxl, paddingHorizontal: space.lg },
  fill: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  profile: { alignItems: 'center', flexDirection: 'row', gap: space.md },
  segment: { borderRadius: 999, flexDirection: 'row', padding: 4 },
  segmentOption: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
  },
});
