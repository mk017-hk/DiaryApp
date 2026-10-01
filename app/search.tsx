import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiaryPage, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import { listEntries, listThreads, type Entry, type Thread } from '@/features/entries';
import { search, type Match } from '@/features/search';
import { fromDateKey, longDate } from '@/lib/date';

/**
 * Finding something you wrote.
 *
 * The app calls itself an archive, and an archive you cannot search is a pile
 * of days with better typography. This is what makes "what did I say about my
 * sister last spring" a question with an answer.
 *
 * It searches on the device, over entries already here. Not a compromise: it is
 * instant, it works on a train with no signal, and it never sends what somebody
 * is looking for in their own diary to a server. A search term can say more
 * about a person than the entry it finds.
 */
export default function Search() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);

  const load = useCallback(async () => {
    const [all, stories] = await Promise.all([listEntries(), listThreads()]);
    setEntries(all);
    setThreads(stories);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const matches = useMemo(() => search(entries, threads, query), [entries, threads, query]);
  const asked = query.trim().length > 0;

  return (
    <DiaryPage ruled={false}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.lg, paddingBottom: space.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text variant="title1">Search</Text>
          <PressableScale
            onPress={() => router.back()}
            haptic="light"
            accessibilityLabel="Close"
            style={styles.close}
          >
            <Text variant="callout" color="inkTertiary">
              Close
            </Text>
          </PressableScale>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="A word, a name, a feeling…"
          placeholderTextColor={theme.colors.inkFaint}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          style={[
            styles.field,
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.md,
              color: theme.colors.ink,
            },
          ]}
          accessibilityLabel="What are you looking for"
        />

        {!asked ? (
          <Text variant="callout" color="inkTertiary" style={styles.blank}>
            Everything you have written is searchable — what you typed, what you said out loud, the
            feelings you named, and the stories you filed things under.
          </Text>
        ) : matches.length === 0 ? (
          // No suggestions and no "did you mean". Being told the diary does not
          // contain something is a complete answer.
          <Text variant="callout" color="inkTertiary" style={styles.blank}>
            Nothing with that in it.
          </Text>
        ) : (
          matches.map((match) => (
            <Result
              key={match.entry.id}
              match={match}
              onPress={() => router.push(`/entry/${match.entry.id}`)}
            />
          ))
        )}
      </ScrollView>
    </DiaryPage>
  );
}

const WHY: Record<Match['matchedOn'], string | null> = {
  body: null,
  transcript: 'in what you said',
  feeling: 'a feeling you named',
  story: 'the story it belongs to',
};

function Result({ match, onPress }: { match: Match; onPress: () => void }) {
  const theme = useTheme();
  const why = WHY[match.matchedOn];
  const { snippet, highlight } = match;

  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      accessibilityLabel={`Entry from ${longDate(fromDateKey(match.entry.entryDate))}`}
      style={styles.result}
    >
      <Text variant="caption" color="inkTertiary">
        {longDate(fromDateKey(match.entry.entryDate))}
        {why === null ? '' : ` · ${why}`}
      </Text>

      {/* Marked rather than merely shown, so the eye lands on the reason this
          entry came back rather than re-reading the line to find it. */}
      <Text variant="body" numberOfLines={3}>
        {highlight === null ? (
          snippet
        ) : (
          <>
            {snippet.slice(0, highlight.start)}
            <Text variant="bodyMedium" style={{ color: theme.colors.accent }}>
              {snippet.slice(highlight.start, highlight.end)}
            </Text>
            {snippet.slice(highlight.end)}
          </>
        )}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  blank: { marginTop: space.xl, maxWidth: 320 },
  close: { padding: space.xxs },
  content: { paddingHorizontal: space.lg },
  field: {
    fontSize: 17,
    marginTop: space.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  result: { gap: space.xxs, paddingVertical: space.md },
});
