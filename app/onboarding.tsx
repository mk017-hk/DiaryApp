import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button, Chip, DiaryPage, Field, Text } from '@/components';
import { space, useTheme } from '@/design';
import { useProfile } from '@/features/profile';

/**
 * First run.
 *
 * Asks for a name before anything else, because everything the assistant says
 * afterwards is addressed to a person. Three short steps, each one thing —
 * a form with six fields on it would be the wrong first impression for an app
 * about writing down how you feel.
 */

const INTENTIONS = [
  'Remember the everyday',
  'Get through something',
  'Watch myself change',
  'Keep a record for later',
];

export default function Onboarding() {
  const router = useRouter();
  const theme = useTheme();
  const { completeOnboarding } = useProfile();

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [name, setName] = useState('');
  const [intention, setIntention] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    await completeOnboarding({
      name,
      ...(intention !== null ? { intention } : {}),
    });
    router.replace('/');
  };

  return (
    <DiaryPage>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <View style={[styles.root, { paddingHorizontal: theme.screenPadding }]}>
          {step === 0 && (
            <Animated.View entering={FadeIn.duration(600)} style={styles.step}>
              <Text variant="display">Somewhere safe for your memories.</Text>
              <Text variant="callout" color="inkSecondary">
                Write, speak or record them. They stay yours.
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
              <Text variant="title1">Nice to meet you, {name.trim()}.</Text>
              <Text variant="callout" color="inkSecondary">
                What brings you here? This only shapes how I check in — you can change it later.
              </Text>

              <View style={styles.chips}>
                {INTENTIONS.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    selected={intention === option}
                    onPress={() => setIntention(intention === option ? null : option)}
                  />
                ))}
              </View>

              <View style={styles.actions}>
                <Button
                  label={intention === null ? 'Skip for now' : 'Start my diary'}
                  onPress={() => void finish()}
                  loading={saving}
                  fullWidth
                />
              </View>
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
    </DiaryPage>
  );
}

const styles = StyleSheet.create({
  actions: { marginTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  fill: { flex: 1 },
  root: { flex: 1, justifyContent: 'center' },
  step: { gap: space.sm, maxWidth: 480 },
});
