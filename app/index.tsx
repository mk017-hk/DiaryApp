import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  Field,
  Screen,
  Skeleton,
  StateView,
  Text,
} from '@/components';
import { emotionColors, space, useTheme, useThemePreference, type TextVariant } from '@/design';

/**
 * Design system gallery.
 *
 * A working reference for every primitive in both themes — the surface used to
 * judge the design language before any product screen is built on top of it.
 * This route is scaffolding and will be replaced by Home in Phase 2.
 */
export default function DesignGallery() {
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const [note, setNote] = useState('');
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>(['Calm']);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const toggleEmotion = (label: string) => {
    setSelectedEmotions((current) =>
      current.includes(label) ? current.filter((e) => e !== label) : [...current, label],
    );
  };

  return (
    <Screen scroll contentContainerStyle={{ paddingBottom: space.xxxl }}>
      <View style={{ paddingTop: space.xl, gap: space.xxs }}>
        <Text variant="overline" color="inkTertiary">
          Diary
        </Text>
        <Text variant="display">Design system</Text>
        <Text variant="callout" color="inkSecondary">
          Every primitive, in the theme you are viewing.
        </Text>
      </View>

      <Section title="Theme">
        <View style={styles.row}>
          {(['system', 'light', 'dark'] as const).map((option) => (
            <Chip
              key={option}
              label={option[0]!.toUpperCase() + option.slice(1)}
              selected={preference === option}
              onPress={() => setPreference(option)}
            />
          ))}
        </View>
        <Text variant="caption" color="inkTertiary">
          Currently rendering the {theme.scheme} theme.
        </Text>
      </Section>

      <Section title="Typography">
        <View style={{ gap: space.md }}>
          {(
            [
              ['display', 'A quiet place'],
              ['title1', 'On this day'],
              ['title2', 'Tuesday morning'],
              ['title3', '14 March 2024'],
              ['body', 'The light came through the kitchen window and I sat with it for a while.'],
              ['callout', 'Supporting copy sits at this size.'],
              ['label', 'Interactive label'],
              ['caption', '3 photos · 2 minutes'],
              ['overline', 'Recent moments'],
            ] as [TextVariant, string][]
          ).map(([variant, sample]) => (
            <View key={variant} style={{ gap: space.xxs }}>
              <Text variant="caption" color="inkFaint">
                {variant}
              </Text>
              <Text variant={variant}>{sample}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Colour">
        <View style={styles.swatchGrid}>
          {(
            [
              ['canvas', theme.colors.canvas],
              ['surface', theme.colors.surface],
              ['surfaceMuted', theme.colors.surfaceMuted],
              ['ink', theme.colors.ink],
              ['inkSecondary', theme.colors.inkSecondary],
              ['inkTertiary', theme.colors.inkTertiary],
              ['accent', theme.colors.accent],
              ['accentSoft', theme.colors.accentSoft],
              ['accentWash', theme.colors.accentWash],
              ['danger', theme.colors.danger],
              ['success', theme.colors.success],
              ['border', theme.colors.border],
            ] as [string, string][]
          ).map(([name, value]) => (
            <View key={name} style={styles.swatch}>
              <View
                style={[
                  styles.swatchChip,
                  {
                    backgroundColor: value,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                  },
                ]}
              />
              <Text variant="caption" color="inkTertiary" numberOfLines={1}>
                {name}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Emotion families">
        <View style={styles.row}>
          {Object.keys(emotionColors).map((family) => (
            <Chip
              key={family}
              label={family}
              dotColor={theme.emotion[family as keyof typeof emotionColors]}
            />
          ))}
        </View>
        <Text variant="caption" color="inkTertiary">
          Muted and closely related on purpose — no colour implies a judgement about the feeling.
        </Text>
      </Section>

      <Section title="Buttons">
        <View style={{ gap: space.sm }}>
          <View style={styles.row}>
            <Button label="Primary" onPress={() => {}} />
            <Button label="Secondary" onPress={() => {}} variant="secondary" />
          </View>
          <View style={styles.row}>
            <Button label="Ghost" onPress={() => {}} variant="ghost" />
            <Button label="Delete" onPress={() => {}} variant="danger" />
          </View>
          <View style={styles.row}>
            <Button label="Small" onPress={() => {}} size="small" variant="secondary" />
            <Button label="Disabled" onPress={() => {}} disabled />
            <Button
              label="Tap to load"
              onPress={() => {
                setLoadingDemo(true);
                setTimeout(() => setLoadingDemo(false), 1600);
              }}
              loading={loadingDemo}
              variant="secondary"
            />
          </View>
          <Button label="Full width" onPress={() => {}} fullWidth />
        </View>
      </Section>

      <Section title="Chips">
        <View style={styles.row}>
          {['Happy', 'Calm', 'Grateful', 'Nostalgic', 'Overwhelmed'].map((label) => (
            <Chip
              key={label}
              label={label}
              selected={selectedEmotions.includes(label)}
              onPress={() => toggleEmotion(label)}
            />
          ))}
        </View>
      </Section>

      <Section title="Fields">
        <View style={{ gap: space.md }}>
          <Field
            label="Title"
            placeholder="Give this moment a name"
            value={note}
            onChangeText={setNote}
            hint="Optional — most entries do not need one."
          />
          <Field
            label="Email"
            placeholder="you@example.com"
            error="That email doesn't look right."
          />
          <Field label="What happened?" placeholder="Start anywhere…" multiline />
        </View>
      </Section>

      <Section title="States">
        <View style={{ gap: space.lg }}>
          <StateBox label="Loading">
            <View style={{ gap: space.sm }}>
              <Skeleton width="40%" height={12} />
              <Skeleton width="100%" height={18} />
              <Skeleton width="70%" height={18} />
            </View>
          </StateBox>

          <StateBox label="Empty">
            <EmptyState
              title="Nothing here yet"
              message="When you capture your first moment, it will live here."
              action={{ label: 'Capture something', onPress: () => {} }}
            />
          </StateBox>

          <StateBox label="Error">
            <ErrorState onRetry={() => {}} />
          </StateBox>

          <StateBox label="StateView — success">
            <StateView
              status="success"
              data={['A walk by the river', 'Coffee with Mum']}
              isEmpty={(items) => items.length === 0}
              empty={{ title: 'Nothing here yet' }}
            >
              {(items) => (
                <View style={{ gap: space.xs }}>
                  {items.map((item) => (
                    <Text key={item} variant="body">
                      {item}
                    </Text>
                  ))}
                </View>
              )}
            </StateView>
          </StateBox>
        </View>
      </Section>

      <Section title="Spacing">
        <View style={{ gap: space.xs }}>
          {Object.entries(space)
            .filter(([, value]) => value > 0)
            .map(([name, value]) => (
              <View key={name} style={styles.spacingRow}>
                <Text variant="caption" color="inkTertiary" style={styles.spacingLabel}>
                  {name} · {value}
                </Text>
                <View
                  style={{
                    backgroundColor: theme.colors.accentSoft,
                    borderRadius: 2,
                    height: 8,
                    width: value,
                  }}
                />
              </View>
            ))}
        </View>
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: space.xxl, gap: space.md }}>
      <Text variant="overline" color="inkTertiary">
        {title}
      </Text>
      <Divider spacing={0} />
      {children}
    </View>
  );
}

function StateBox({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();

  return (
    <View style={{ gap: space.xs }}>
      <Text variant="caption" color="inkFaint">
        {label}
      </Text>
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          minHeight: 140,
          padding: space.md,
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  spacingLabel: { width: 90 },
  spacingRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  swatch: { gap: space.xxs, width: '30%' },
  swatchChip: { borderWidth: StyleSheet.hairlineWidth, height: 56, width: '100%' },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
