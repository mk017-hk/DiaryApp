import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Chip, Icon, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import { useSession } from '@/features/auth';
import { VideoPoster } from '@/features/media';
import { fromDateKey, longDate } from '@/lib/date';
import {
  deleteFromSharedDiary,
  readSharedDiary,
  writeToSharedDiary,
  type SharedEntry,
} from '@/services/supabase/sharedDiary';
import { diaryMembers, myDiaries } from '@/services/supabase/sharing';

const MOODS = [
  { value: 1, label: 'Heavy' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Even' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Bright' },
];

/**
 * A diary somebody shared with you.
 *
 * Read from their account each time it opens and never copied to this phone —
 * see `sharedDiary.ts` for why. Anything they kept "just for me" is not here
 * at all; the database never sends it. You can add to it as yourself, and
 * anything you add can be kept just for you, too.
 */
export default function SharedDiary() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();

  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState<string | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [entries, setEntries] = useState<SharedEntry[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const [body, setBody] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [personal, setPersonal] = useState(false);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (typeof id !== 'string') return;
    const [read, members, diaries] = await Promise.all([
      readSharedDiary(id),
      diaryMembers(id),
      myDiaries(),
    ]);
    if (!read.ok) {
      setFailed(read.error.userMessage);
      return;
    }
    setFailed(null);
    setEntries(read.value);
    if (members.ok) {
      setNames(
        new Map(members.value.map((member) => [member.userId, member.displayName ?? 'Someone'])),
      );
      setOwner(members.value.find((member) => member.role === 'owner')?.displayName ?? null);
    }
    if (diaries.ok) setTitle(diaries.value.find((diary) => diary.id === id)?.title ?? '');
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const post = async () => {
    if (typeof id !== 'string' || user === null || body.trim().length === 0) return;
    setPosting(true);
    const result = await writeToSharedDiary(id, user.id, {
      body,
      mood,
      emotions: [],
      isPersonal: personal,
    });
    setPosting(false);
    if (!result.ok) {
      Alert.alert('That did not save', result.error.userMessage);
      return;
    }
    setBody('');
    setMood(null);
    setPersonal(false);
    setEntries((current) => [result.value, ...(current ?? [])]);
  };

  const remove = (entry: SharedEntry) =>
    Alert.alert('Delete what you wrote?', 'It goes from their diary for both of you.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteFromSharedDiary(entry.id).then((result) => {
            if (result.ok)
              setEntries((current) => (current ?? []).filter((e) => e.id !== entry.id));
          });
        },
      },
    ]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.fill, { backgroundColor: theme.colors.canvas }]}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <PressableScale onPress={() => router.back()} accessibilityLabel="Back">
            <Icon name="chevron-left" size={28} color="ink" />
          </PressableScale>
          <View style={styles.flex}>
            <Text variant="title2" numberOfLines={1}>
              {owner !== null && owner.length > 0
                ? `${owner}’s diary`
                : title.length > 0
                  ? title
                  : 'A shared diary'}
            </Text>
            <Text variant="caption" color="inkTertiary">
              Shared with you · read from their account, not kept on this phone
            </Text>
          </View>
        </View>

        <Card>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            placeholder="Add something to it…"
            placeholderTextColor={theme.colors.inkFaint}
            accessibilityLabel="Write in the shared diary"
            style={[
              styles.input,
              { color: theme.colors.ink, fontFamily: theme.fontFamily.serifRegular },
            ]}
          />
          <View style={styles.moods}>
            {MOODS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={mood === option.value}
                onPress={() => setMood(mood === option.value ? null : option.value)}
              />
            ))}
          </View>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text variant="label">Just for me</Text>
              <Text variant="caption" color="inkTertiary">
                Kept in this diary, readable only by you.
              </Text>
            </View>
            <Switch
              value={personal}
              onValueChange={setPersonal}
              trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
              accessibilityLabel="Just for me"
            />
          </View>
          <Button
            label="Add"
            onPress={() => void post()}
            loading={posting}
            disabled={body.trim().length === 0}
            fullWidth
          />
        </Card>

        {failed !== null && (
          <Card tone="surface">
            <Text variant="callout" color="inkSecondary">
              {failed}
            </Text>
            <Button
              label="Try again"
              variant="secondary"
              size="small"
              onPress={() => void load()}
            />
          </Card>
        )}

        {entries !== null && entries.length === 0 && (
          <Text variant="callout" color="inkTertiary">
            Nothing in it yet that you can read.
          </Text>
        )}

        {(entries ?? []).map((entry) => {
          const mine = entry.authorId === user?.id;
          const first = entry.media[0];
          return (
            <Card key={entry.id}>
              <View style={styles.meta}>
                <Text variant="caption" color="inkTertiary" style={styles.flex}>
                  {mine ? 'You' : (names.get(entry.authorId) ?? 'Them')} ·{' '}
                  {longDate(fromDateKey(entry.entryDate))}
                  {entry.isPersonal === true ? ' · just for you' : ''}
                </Text>
                {mine && (
                  <PressableScale
                    onPress={() => remove(entry)}
                    accessibilityLabel="Delete what you wrote"
                  >
                    <Icon name="delete-outline" size={20} color="inkTertiary" />
                  </PressableScale>
                )}
              </View>
              {first !== undefined && (
                <View style={styles.media}>
                  <VideoPoster item={first} />
                </View>
              )}
              <Text variant="body" style={{ fontFamily: theme.fontFamily.serifRegular }}>
                {entry.body.length > 0 ? entry.body : 'A recorded moment'}
              </Text>
            </Card>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xxl, paddingHorizontal: space.lg },
  fill: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  header: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  input: { fontSize: 18, lineHeight: 28, minHeight: 90, textAlignVertical: 'top' },
  media: { marginBottom: space.xs },
  meta: { alignItems: 'center', flexDirection: 'row', gap: space.xs, marginBottom: space.xxs },
  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginVertical: space.sm },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
});
