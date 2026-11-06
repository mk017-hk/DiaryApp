import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Card, Icon, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import { useSession } from '@/features/auth';
import type { Entry } from '@/features/entries';
import {
  deleteReflection,
  reflectionFor,
  requestReflection,
  type Reflection,
  type SuggestionKind,
  type UnavailableReason,
} from '@/services/supabase/reflections';

import { pendingReflections, subscribeToReflections } from './queue';

const SUGGESTION_ICONS: Record<SuggestionKind, string> = {
  write: 'pencil-outline',
  try: 'leaf',
  keep: 'bookmark-outline',
};

const SUGGESTION_LABELS: Record<SuggestionKind, string> = {
  write: 'Something to write about',
  try: 'Something to try',
  keep: 'Something to keep',
};

/** What to say when there are no notes, in words rather than error codes. */
const WHY: Record<UnavailableReason, string> = {
  not_allowed:
    'The assistant can only read this if it is turned on (You → Account) and this entry has not been held back from it.',
  nothing_to_read:
    'There are no words in this one yet. Once a recording is transcribed, there will be.',
  no_model_configured: 'The assistant is not connected yet. Notes will appear once it is.',
  daily_limit: 'That is plenty of notes for one day. Ask again tomorrow.',
  declined: 'The assistant did not find anything it could say well about this one.',
  withheld: 'The assistant did not find anything it could say well about this one.',
  busy: 'The assistant could not be reached just now. Try again in a moment.',
  model_error: 'The assistant could not be reached just now. Try again in a moment.',
  offline: 'You are offline. Notes can be asked for once you have a connection.',
};

/**
 * The assistant's notes on one entry, and what it suggests.
 *
 * Every suggestion is an offer. The card never presses, never follows up, and
 * goes entirely with one tap on Remove.
 */
export function ReflectionCard({
  entry,
  onKeep,
}: {
  entry: Entry;
  /** Saves the entry, for a "keep" suggestion. */
  onKeep: () => void;
}) {
  const router = useRouter();
  const theme = useTheme();
  const { status } = useSession();

  const [reflection, setReflection] = useState<Reflection | null | 'loading'>('loading');
  const [queued, setQueued] = useState(false);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [support, setSupport] = useState(false);

  const signedIn = status === 'signed-in';
  const heldBack = entry.aiExcluded === true || entry.isPersonal === true;

  const load = useCallback(() => {
    if (!signedIn) return;
    void Promise.all([reflectionFor(entry.id), pendingReflections()]).then(([found, pending]) => {
      setReflection(found);
      setQueued(pending.some((item) => item.entryId === entry.id));
    });
  }, [entry.id, signedIn]);

  useEffect(() => {
    load();
    return subscribeToReflections(load);
  }, [load]);

  if (!signedIn) return null;

  if (heldBack) {
    return (
      <Text variant="caption" color="inkTertiary" style={styles.quiet}>
        Held back from the assistant, so it has not read this one.
      </Text>
    );
  }

  const ask = async (force: boolean) => {
    setBusy(true);
    setWhy(null);
    const outcome = await requestReflection(entry.id, force);
    setBusy(false);
    if (outcome.kind === 'reflection') setReflection(outcome.reflection);
    else if (outcome.kind === 'support') setSupport(true);
    else setWhy(WHY[outcome.reason]);
  };

  const remove = (current: Reflection) =>
    Alert.alert('Remove these notes?', 'Your entry stays exactly as it is.', [
      { text: 'Keep them', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void deleteReflection(current.id).then((ok) => {
            if (ok) setReflection(null);
          });
        },
      },
    ]);

  if (support) {
    return (
      <Card
        tone="accentWash"
        onPress={() => router.push('/support')}
        accessibilityLabel="People to talk to"
      >
        <Text variant="bodyMedium">If you want to talk to someone</Text>
        <Text variant="callout" color="inkSecondary">
          There are people who can listen, any time. This is where to find them.
        </Text>
      </Card>
    );
  }

  if (reflection === 'loading') return null;

  if (reflection === null) {
    return (
      <Card tone="accentWash" style={styles.card}>
        <View style={styles.header}>
          <Icon name="robot-outline" size={18} color="accent" />
          <Text variant="overline" color="accent" style={styles.flex}>
            Notes
          </Text>
        </View>
        {queued && why === null ? (
          <Text variant="callout" color="inkSecondary">
            Notes on this will appear once it has reached your account.
          </Text>
        ) : (
          <Text variant="callout" color="inkSecondary">
            {why ?? 'The assistant can read this and leave a few notes and suggestions beside it.'}
          </Text>
        )}
        <PressableScale
          onPress={() => void ask(false)}
          disabled={busy}
          accessibilityLabel="Ask the assistant for notes on this entry"
          style={[styles.button, { backgroundColor: theme.colors.accent }]}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.onAccent} />
          ) : (
            <Text variant="label" color="onAccent">
              Ask for notes
            </Text>
          )}
        </PressableScale>
      </Card>
    );
  }

  return (
    <Card tone="accentWash" style={styles.card}>
      <View style={styles.header}>
        <Icon name="robot-outline" size={18} color="accent" />
        <Text variant="overline" color="accent" style={styles.flex}>
          Notes
        </Text>
      </View>

      <Text variant="body" style={{ fontFamily: theme.fontFamily.serifRegular }}>
        {reflection.notes}
      </Text>

      {reflection.themes.length > 0 && (
        <View style={styles.chips}>
          {reflection.themes.map((theme_) => (
            <PressableScale
              key={theme_}
              onPress={() => router.push(`/search?q=${encodeURIComponent(theme_)}`)}
              accessibilityLabel={`Find other entries about ${theme_}`}
              style={[styles.chip, { backgroundColor: theme.colors.card }]}
            >
              <Text variant="caption" color="inkSecondary">
                {theme_}
              </Text>
            </PressableScale>
          ))}
        </View>
      )}

      {reflection.feelings.length > 0 && (
        <Text variant="caption" color="inkTertiary">
          You named: {reflection.feelings.join(', ')}
        </Text>
      )}

      {reflection.suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {reflection.suggestions.map((suggestion) => {
            const action =
              suggestion.kind === 'write'
                ? () =>
                    router.push(`/compose?mode=write&prompt=${encodeURIComponent(suggestion.text)}`)
                : suggestion.kind === 'keep'
                  ? onKeep
                  : undefined;
            const body = (
              <>
                <View style={[styles.suggestionIcon, { backgroundColor: theme.colors.card }]}>
                  <Icon name={SUGGESTION_ICONS[suggestion.kind]} size={18} color="accent" />
                </View>
                <View style={styles.flex}>
                  <Text variant="caption" color="inkTertiary">
                    {SUGGESTION_LABELS[suggestion.kind]}
                  </Text>
                  <Text variant="callout">{suggestion.text}</Text>
                </View>
              </>
            );
            return action === undefined ? (
              <View key={suggestion.text} style={styles.suggestion}>
                {body}
              </View>
            ) : (
              <PressableScale
                key={suggestion.text}
                onPress={action}
                accessibilityLabel={`${SUGGESTION_LABELS[suggestion.kind]}: ${suggestion.text}`}
                style={styles.suggestion}
              >
                {body}
              </PressableScale>
            );
          })}
        </View>
      )}

      {why !== null && (
        <Text variant="caption" color="inkTertiary">
          {why}
        </Text>
      )}

      <View style={styles.footer}>
        <PressableScale
          onPress={() => void ask(true)}
          disabled={busy}
          accessibilityLabel="Ask for new notes"
        >
          <Text variant="caption" color="accent">
            {busy ? 'Asking…' : 'Ask again'}
          </Text>
        </PressableScale>
        <PressableScale onPress={() => remove(reflection)} accessibilityLabel="Remove these notes">
          <Text variant="caption" color="inkTertiary">
            Remove
          </Text>
        </PressableScale>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 140,
    paddingHorizontal: space.md,
  },
  card: { gap: space.sm },
  chip: { borderRadius: 999, paddingHorizontal: space.sm, paddingVertical: space.xxs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  flex: { flex: 1, gap: 2 },
  footer: { flexDirection: 'row', gap: space.lg, justifyContent: 'flex-end' },
  header: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  quiet: { marginTop: space.md },
  suggestion: { alignItems: 'flex-start', flexDirection: 'row', gap: space.sm },
  suggestionIcon: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  suggestions: { gap: space.sm },
});
