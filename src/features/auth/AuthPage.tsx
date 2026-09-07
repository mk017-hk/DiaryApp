import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiaryPage, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';

interface AuthPageProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Shows a back affordance. Off on the first screen, which has nowhere to go. */
  onBack?: () => void;
}

/**
 * The shell every auth screen sits in.
 *
 * Sign-in pages are usually where a product's character disappears and a
 * generic form appears. This keeps the diary page underneath, so the very
 * first thing anyone sees is the thing they came for rather than a login box
 * that could belong to anything.
 */
export function AuthPage({ title, subtitle, children, onBack }: AuthPageProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <DiaryPage>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingHorizontal: theme.screenPadding,
              paddingTop: insets.top + space.lg,
              paddingBottom: insets.bottom + space.xxl,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {onBack !== undefined && (
            <PressableScale
              onPress={() => {
                if (router.canGoBack()) router.back();
                else onBack();
              }}
              haptic="light"
              accessibilityLabel="Go back"
              style={styles.back}
            >
              <Text variant="label" color="inkTertiary">
                ← Back
              </Text>
            </PressableScale>
          )}

          <Animated.View entering={FadeInDown.duration(400)} style={styles.body}>
            <View style={styles.heading}>
              <Text variant="title1">{title}</Text>
              {subtitle !== undefined && (
                <Text variant="callout" color="inkSecondary">
                  {subtitle}
                </Text>
              )}
            </View>

            {children}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </DiaryPage>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', paddingRight: space.md, paddingVertical: space.xs },
  body: { gap: space.lg, maxWidth: 480 },
  fill: { flex: 1 },
  heading: { gap: space.xs },
  scroll: { flexGrow: 1, justifyContent: 'center' },
});
