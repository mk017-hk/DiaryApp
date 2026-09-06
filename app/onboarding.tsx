import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button, Chip, DiaryPage, Field, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
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

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [intentions, setIntentions] = useState<IntentionId[]>([]);
  const [tone, setTone] = useState<ToneId>('gentle');
  const [capture, setCapture] = useState<CapturePreferenceId>('either');
  const [saving, setSaving] = useState(false);

  const toggleIntention = (id: IntentionId) =>
    setIntentions((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const finish = async () => {
    setSaving(true);
    await completeOnboarding({ name, intentions, tone, capture });
    router.replace('/');
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
                <Button
                  label="Start my diary"
                  onPress={() => void finish()}
                  loading={saving}
                  fullWidth
                />
              </View>
            </Animated.View>
          )}
        </ScrollView>

        {step > 0 && (
          <View style={[styles.progress, { paddingHorizontal: theme.screenPadding }]}>
            {[1, 2, 3, 4].map((index) => (
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
  pip: { borderRadius: 2, flex: 1, height: 3 },
  progress: { flexDirection: 'row', gap: space.xs, paddingBottom: space.xl },
  sample: { gap: space.xxs, marginTop: space.md, padding: space.md },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.xxl },
  skip: { alignItems: 'center', paddingVertical: space.xs },
  step: { gap: space.sm, maxWidth: 480 },
});
