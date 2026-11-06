import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button, Chip, DiaryPage, Field, PressableScale, Stepper, Text } from '@/components';
import { space, useTheme } from '@/design';
import { useSession } from '@/features/auth';
import {
  CYCLE_LENGTH_RANGE,
  DEFAULT_CYCLE_SETTINGS,
  PERIOD_LENGTH_RANGE,
  setPeriodDays,
  useCycle,
} from '@/features/cycle';
import { addDays, daysBetween, fromDateKey, monthName, toDateKey, weekOf } from '@/lib/date';
import { useProfile } from '@/features/profile';
import {
  CAPTURE_PREFERENCES,
  INTENTIONS,
  TONES,
  type CapturePreferenceId,
  type IntentionId,
  type ToneId,
} from '@/features/profile/profileStore';

/**
 * First run.
 *
 * Five short steps, one question each, every one skippable. It asks more than
 * a sign-up form would because the answers genuinely change the app — the
 * voice it speaks in, what it asks about, which button is the big one. A
 * diary that greets everybody identically is not personal, it is just an app
 * with your name in it.
 *
 * What it does not do is feel like a form: no field is required past the name,
 * nothing is validated at you, and any step can be passed over.
 */
export default function Onboarding() {
  const router = useRouter();
  const theme = useTheme();
  const { completeOnboarding } = useProfile();
  const { status } = useSession();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [intentions, setIntentions] = useState<IntentionId[]>([]);
  const [tone, setTone] = useState<ToneId>('gentle');
  const [capture, setCapture] = useState<CapturePreferenceId>('either');
  const [tracking, setTracking] = useState(false);
  const [lastPeriod, setLastPeriod] = useState<string | null>(null);
  const [cycleLength, setCycleLength] = useState(DEFAULT_CYCLE_SETTINGS.cycleLength);
  const [periodLength, setPeriodLength] = useState(DEFAULT_CYCLE_SETTINGS.periodLength);
  const [saving, setSaving] = useState(false);
  const { updateSettings } = useCycle();
  const [today] = useState(() => toDateKey(new Date()));

  const toggleIntention = (id: IntentionId) =>
    setIntentions((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const finish = async (assistantAllowed: boolean) => {
    setSaving(true);

    if (tracking) {
      await updateSettings({ enabled: true, cycleLength, periodLength });
      // The days she said her last period ran, up to today and no further.
      if (lastPeriod !== null) {
        const on = Array.from({ length: periodLength }, (_, index) =>
          addDays(lastPeriod, index),
        ).filter((day) => daysBetween(today, day) <= 0);
        await setPeriodDays({ on, off: [] });
      }
    }

    // The answer is held on the device, not sent. Onboarding runs before
    // sign-up, so there is no session yet and an update keyed on auth.uid()
    // would match nothing and vanish silently — which it did, until a browser
    // run showed ai_consented_at still null after somebody had said yes.
    // `PendingConsent` applies it the moment an account exists.
    await completeOnboarding({
      name,
      intentions,
      tone,
      capture,
      assistantConsent: assistantAllowed,
    });

    // Straight to sign-up, not to the welcome screen the guard would otherwise
    // pick: they have just told us who they are, so "sign in or create an
    // account?" is a question with an obvious answer.
    router.replace(status === 'signed-out' ? '/sign-up' : '/');
  };

  const toneSample = TONES.find((option) => option.id === tone)?.sample ?? '';
  const firstName = name.trim().split(/\s+/)[0] ?? '';

  return (
    <DiaryPage>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingHorizontal: theme.screenPadding }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 0 && (
            <Animated.View entering={FadeIn.duration(600)} style={styles.step}>
              <Text variant="display">Somewhere safe for your memories.</Text>
              <Text variant="callout" color="inkSecondary">
                Write them, speak them, record them. They stay yours.
              </Text>
              <View style={styles.actions}>
                <Button label="Begin" onPress={() => setStep(1)} fullWidth />
              </View>
            </Animated.View>
          )}

          {step === 1 && (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.step}>
              <Text variant="title1">What should I call you?</Text>
              <Text variant="callout" color="inkSecondary">
                Just a first name is plenty.
              </Text>

              <Field
                label="Your name"
                hideLabel
                placeholder="Your name"
                value={name}
                onChangeText={setName}
                autoFocus
                autoCapitalize="words"
                autoComplete="given-name"
                returnKeyType="next"
                maxLength={40}
                onSubmitEditing={() => name.trim().length > 0 && setStep(2)}
              />

              <View style={styles.actions}>
                <Button
                  label="Continue"
                  onPress={() => setStep(2)}
                  disabled={name.trim().length === 0}
                  fullWidth
                />
              </View>
            </Animated.View>
          )}

          {step === 2 && (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.step}>
              <Text variant="title1">What brings you here{firstName ? `, ${firstName}` : ''}?</Text>
              <Text variant="callout" color="inkSecondary">
                Pick as many as fit. It shapes what I ask you about, and you can change it later.
              </Text>

              <View style={styles.chips}>
                {INTENTIONS.map((option) => (
                  <Chip
                    key={option.id}
                    label={option.label}
                    selected={intentions.includes(option.id)}
                    onPress={() => toggleIntention(option.id)}
                  />
                ))}
              </View>

              <View style={styles.actions}>
                <Button label="Continue" onPress={() => setStep(3)} fullWidth />
                <SkipLink onPress={() => setStep(3)} />
              </View>
            </Animated.View>
          )}

          {step === 3 && (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.step}>
              <Text variant="title1">How should I talk to you?</Text>
              <Text variant="callout" color="inkSecondary">
                This is how I will ask, every day.
              </Text>

              <View style={styles.chips}>
                {TONES.map((option) => (
                  <Chip
                    key={option.id}
                    label={option.label}
                    selected={tone === option.id}
                    onPress={() => setTone(option.id)}
                  />
                ))}
              </View>

              {/* Hearing it beats reading a label. */}
              <View
                style={[
                  styles.sample,
                  { backgroundColor: theme.colors.accentWash, borderRadius: theme.radius.lg },
                ]}
              >
                <Text variant="caption" color="inkTertiary">
                  Sounds like
                </Text>
                <Text variant="title3">{toneSample}</Text>
              </View>

              <View style={styles.actions}>
                <Button label="Continue" onPress={() => setStep(4)} fullWidth />
              </View>
            </Animated.View>
          )}

          {step === 4 && (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.step}>
              <Text variant="title1">How do you like to say things?</Text>
              <Text variant="callout" color="inkSecondary">
                Whichever you pick gets the big button. The other is always one tap away.
              </Text>

              <View style={styles.chips}>
                {CAPTURE_PREFERENCES.map((option) => (
                  <Chip
                    key={option.id}
                    label={option.label}
                    selected={capture === option.id}
                    onPress={() => setCapture(option.id)}
                  />
                ))}
              </View>

              <View style={styles.actions}>
                <Button label="Continue" onPress={() => setStep(5)} fullWidth />
              </View>
            </Animated.View>
          )}

          {step === 5 && (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.step}>
              <Text variant="title1">Would you like to track your cycle too?</Text>
              <Text variant="callout" color="inkSecondary">
                Your period, predictions, and how your moods line up with your cycle — beside your
                diary, never in it. It stays private, even if you share your diary one day.
              </Text>

              <View style={styles.actions}>
                <Button
                  label="Yes, track my cycle"
                  onPress={() => {
                    setTracking(true);
                    setStep(6);
                  }}
                  fullWidth
                />
                <PressableScale
                  onPress={() => {
                    setTracking(false);
                    setStep(7);
                  }}
                  haptic="light"
                  accessibilityLabel="Not now"
                  style={styles.skip}
                >
                  <Text variant="caption" color="inkTertiary">
                    Not now — you can turn it on any time
                  </Text>
                </PressableScale>
              </View>
            </Animated.View>
          )}

          {step === 6 && (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.step}>
              <Text variant="title1">When did your last period start?</Text>
              <Text variant="callout" color="inkSecondary">
                Roughly is fine. Predictions get better with every period you log.
              </Text>

              <RecentDays today={today} selected={lastPeriod} onSelect={setLastPeriod} />

              <View style={styles.lengths}>
                <Stepper
                  label="Cycle"
                  unit="days"
                  value={cycleLength}
                  onChange={(value) => value !== undefined && setCycleLength(value)}
                  min={CYCLE_LENGTH_RANGE.min}
                  max={CYCLE_LENGTH_RANGE.max}
                />
                <Stepper
                  label="Period"
                  unit={periodLength === 1 ? 'day' : 'days'}
                  value={periodLength}
                  onChange={(value) => value !== undefined && setPeriodLength(value)}
                  min={PERIOD_LENGTH_RANGE.min}
                  max={PERIOD_LENGTH_RANGE.max}
                />
              </View>
              <Text variant="caption" color="inkTertiary">
                Not sure? Leave these as they are. 28 and 5 are only a starting point.
              </Text>

              <View style={styles.actions}>
                <Button label="Continue" onPress={() => setStep(7)} fullWidth />
                {lastPeriod === null && (
                  <PressableScale
                    onPress={() => setStep(7)}
                    haptic="light"
                    accessibilityLabel="I don't remember"
                    style={styles.skip}
                  >
                    <Text variant="caption" color="inkTertiary">
                      I don’t remember — I’ll log the next one
                    </Text>
                  </PressableScale>
                )}
              </View>
            </Animated.View>
          )}

          {step === 7 && (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.step}>
              <Text variant="title1">One thing to decide.</Text>
              <Text variant="callout" color="inkSecondary">
                To ask you better questions over time, I would read what you write. Only the words —
                never your video or your voice — and only ever to ask, never to judge.
              </Text>
              <Text variant="callout" color="inkSecondary">
                Any single entry can be held back, and any thread can be marked private and skipped
                entirely. You can change this whenever you like.
              </Text>

              <View style={styles.actions}>
                <Button
                  label="Yes, read what I write"
                  onPress={() => void finish(true)}
                  loading={saving}
                  fullWidth
                />
                <PressableScale
                  onPress={() => void finish(false)}
                  haptic="light"
                  accessibilityLabel="Keep it to yourself for now"
                  style={styles.skip}
                >
                  <Text variant="caption" color="inkTertiary">
                    Not for now — just keep my diary
                  </Text>
                </PressableScale>
              </View>
            </Animated.View>
          )}
        </ScrollView>

        {step > 0 && (
          <View style={[styles.progress, { paddingHorizontal: theme.screenPadding }]}>
            {[1, 2, 3, 4, 5, 6, 7].map((index) => (
              <View
                key={index}
                style={[
                  styles.pip,
                  {
                    backgroundColor:
                      index <= step ? theme.colors.accentSoft : theme.colors.surfaceMuted,
                  },
                ]}
              />
            ))}
          </View>
        )}
      </KeyboardAvoidingView>
    </DiaryPage>
  );
}

/**
 * The last six weeks, a tap each. A full date picker for "roughly when" would
 * be a form; this is a calendar page.
 */
function RecentDays({
  today,
  selected,
  onSelect,
}: {
  today: string;
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const theme = useTheme();
  const firstWeek = weekOf(addDays(today, -41))[0] ?? today;
  const days = Array.from({ length: daysBetween(firstWeek, today) + 1 }, (_, i) =>
    addDays(firstWeek, i),
  );
  const firstOfMonth = new Set(days.filter((day) => day.endsWith('-01')));

  return (
    <View style={styles.recent}>
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((initial, index) => (
        <View key={`h-${String(index)}`} style={styles.recentCell}>
          <Text variant="caption" color="inkTertiary">
            {initial}
          </Text>
        </View>
      ))}
      {days.map((day) => {
        const on = day === selected;
        const date = fromDateKey(day);
        return (
          <View key={day} style={styles.recentCell}>
            <PressableScale
              onPress={() => onSelect(on ? null : day)}
              haptic="selection"
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${String(date.getDate())} ${monthName(date.getMonth())}`}
              style={[
                styles.recentDay,
                { backgroundColor: on ? theme.colors.period : 'transparent' },
              ]}
            >
              <Text variant="callout" color={on ? 'onAccent' : 'ink'}>
                {firstOfMonth.has(day)
                  ? monthName(date.getMonth()).slice(0, 3)
                  : String(date.getDate())}
              </Text>
            </PressableScale>
          </View>
        );
      })}
    </View>
  );
}

function SkipLink({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      accessibilityLabel="Skip this"
      style={styles.skip}
    >
      <Text variant="caption" color="inkTertiary">
        Skip this
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.xs, marginTop: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  fill: { flex: 1 },
  lengths: { gap: space.sm, marginTop: space.md },
  pip: { borderRadius: 2, flex: 1, height: 3 },
  recent: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm },
  recentCell: { alignItems: 'center', paddingVertical: 2, width: `${100 / 7}%` },
  recentDay: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  progress: { flexDirection: 'row', gap: space.xs, paddingBottom: space.xl },
  sample: { gap: space.xxs, marginTop: space.md, padding: space.md },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.xxl },
  skip: { alignItems: 'center', paddingVertical: space.xs },
  step: { gap: space.sm, maxWidth: 480 },
});
