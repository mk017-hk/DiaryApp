import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Icon, PressableScale, SectionHeader, Text } from '@/components';
import { space, useTheme } from '@/design';
import {
  AssistantConsent,
  AssistantQuestion,
  dailyPrompt,
  PROMPT_SETS,
} from '@/features/assistant';
import { useSession } from '@/features/auth';
import { listEntries, type Entry } from '@/features/entries';
import { useProfile } from '@/features/profile';
import { daysBetween, longDate, toDateKey } from '@/lib/date';
import { recentMessages, type AssistantMessage } from '@/services/supabase/assistant';

/** Questions people ask a cycle tracker, answered by the library. */
const CYCLE_QUESTIONS = [
  { question: 'When am I most likely to get pregnant?', article: 'phase-fertile' },
  { question: 'Why do I feel different before my period?', article: 'phase-luteal' },
  { question: 'How long should a period last?', article: 'phase-period' },
  { question: 'When should I talk to a GP?', article: 'when-to-ask' },
  { question: 'How are my predictions worked out?', article: 'logging' },
] as const;

/**
 * Ask.
 *
 * Somewhere to go when you want a question rather than a blank page. Three
 * kinds, in the order they are most personal: the assistant's own question,
 * drawn from your diary; questions to write from, for any kind of day; and
 * plain answers about your cycle.
 *
 * The assistant only ever asks. It does not diagnose, advise, or tell you what
 * your entries mean — and it reads nothing until you say it may.
 */
export default function Ask() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { status } = useSession();
  const { name, tone, intentions } = useProfile();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<AssistantMessage[]>([]);
  const [openSet, setOpenSet] = useState<string>(PROMPT_SETS[0]?.id ?? '');

  const load = useCallback(async () => {
    const [all, past] = await Promise.all([listEntries(), recentMessages(8)]);
    setEntries(all);
    setHistory(past);
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const fallback = useMemo(() => {
    const today = toDateKey(new Date());
    const latest = entries[0];
    return dailyPrompt({
      name,
      tone,
      intentions,
      daysSinceLast: latest === undefined ? null : daysBetween(latest.entryDate, today),
      hasEntryToday: entries.some((entry) => entry.entryDate === today),
    });
  }, [entries, name, tone, intentions]);

  const writeFrom = (prompt: string) =>
    router.push(`/compose?mode=write&prompt=${encodeURIComponent(prompt)}`);

  const set = PROMPT_SETS.find((candidate) => candidate.id === openSet);

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.canvas }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text variant="title1">Ask</Text>
          <Text variant="callout" color="inkSecondary">
            A question when you want one.
          </Text>
        </View>

        {/* ── The assistant ─────────────────────────────────── */}
        <Card tone="accentWash">
          <View style={styles.badge}>
            <Icon name="robot-outline" size={18} color="accent" />
            <Text variant="overline" color="accent">
              Today’s question
            </Text>
          </View>
          <View style={styles.question}>
            <AssistantQuestion fallback={fallback} variant="title2" />
          </View>
          <PressableScale
            onPress={() => writeFrom(fallback)}
            accessibilityLabel="Answer this question"
            style={[styles.answer, { backgroundColor: theme.colors.accent }]}
          >
            <Icon name="pencil-outline" size={18} color="onAccent" />
            <Text variant="label" color="onAccent">
              Answer it
            </Text>
          </PressableScale>
        </Card>

        {/* ── Prompts ───────────────────────────────────────── */}
        <View>
          <SectionHeader title="Something to write about" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sets}
            style={styles.setScroller}
          >
            {PROMPT_SETS.map((candidate) => {
              const active = candidate.id === openSet;
              return (
                <PressableScale
                  key={candidate.id}
                  onPress={() => setOpenSet(candidate.id)}
                  haptic="selection"
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={candidate.title}
                  style={[
                    styles.set,
                    { backgroundColor: active ? theme.colors.accent : theme.colors.surface },
                  ]}
                >
                  <Icon name={candidate.icon} size={18} color={active ? 'onAccent' : 'accent'} />
                  <Text variant="label" color={active ? 'onAccent' : 'ink'}>
                    {candidate.title}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>
          <View style={styles.stack}>
            {set?.prompts.map((prompt) => (
              <Card
                key={prompt}
                onPress={() => writeFrom(prompt)}
                accessibilityLabel={`Write about: ${prompt}`}
              >
                <View style={styles.promptRow}>
                  <Text variant="title3" style={styles.flex}>
                    {prompt}
                  </Text>
                  <Icon name="pencil-outline" color="accent" />
                </View>
              </Card>
            ))}
          </View>
        </View>

        {/* ── Cycle questions ───────────────────────────────── */}
        <View>
          <SectionHeader title="About your cycle" />
          <Card>
            {CYCLE_QUESTIONS.map(({ question, article }, index) => (
              <PressableScale
                key={article}
                onPress={() => router.push(`/library/${article}`)}
                accessibilityLabel={question}
                style={[
                  styles.faq,
                  index > 0 && {
                    borderTopColor: theme.colors.border,
                    borderTopWidth: StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <Text variant="bodyMedium" style={styles.flex}>
                  {question}
                </Text>
                <Icon name="chevron-right" color="inkFaint" />
              </PressableScale>
            ))}
          </Card>
          <Text variant="caption" color="inkTertiary" style={styles.note}>
            General information, not medical advice. For anything that worries you, a GP or
            pharmacist is the right person to ask.
          </Text>
        </View>

        {/* ── History ───────────────────────────────────────── */}
        {history.length > 0 && (
          <View>
            <SectionHeader title="What it has asked you" />
            <View style={styles.stack}>
              {history.map((message) => (
                <Card key={message.id} tone="surface">
                  <Text variant="caption" color="inkTertiary">
                    {longDate(new Date(message.createdAt))}
                  </Text>
                  <Text variant="body">{message.content}</Text>
                </Card>
              ))}
            </View>
          </View>
        )}

        {/* ── Consent ───────────────────────────────────────── */}
        {status === 'signed-in' ? (
          <Card>
            <AssistantConsent />
          </Card>
        ) : (
          <Text variant="caption" color="inkTertiary">
            The assistant’s own questions come from your diary, so they need an account. The rest of
            this page works without one.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  answer: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: space.xxs,
    marginTop: space.md,
    minHeight: 40,
    paddingHorizontal: space.md,
  },
  badge: { alignItems: 'center', flexDirection: 'row', gap: space.xxs },
  content: { gap: space.lg, paddingBottom: space.xxl, paddingHorizontal: space.lg },
  faq: { alignItems: 'center', flexDirection: 'row', gap: space.sm, minHeight: 52 },
  fill: { flex: 1 },
  flex: { flex: 1 },
  note: { marginTop: space.xs },
  promptRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  question: { marginTop: space.xs },
  set: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: space.xxs,
    minHeight: 40,
    paddingHorizontal: space.md,
  },
  setScroller: { marginBottom: space.sm, marginHorizontal: -space.lg },
  sets: { gap: space.xs, paddingHorizontal: space.lg },
  stack: { gap: space.sm },
});
