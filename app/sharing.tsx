import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Divider, Field, PressableScale, Screen, Text } from '@/components';
import { space, useTheme } from '@/design';
import { AuthNotice, useSession } from '@/features/auth';
import {
  acceptInvite,
  createInvite,
  diaryMembers,
  leaveDiary,
  myDiaries,
  type DiaryMember,
} from '@/services/supabase/sharing';

/**
 * Sharing a diary.
 *
 * For the case the concept describes: two people keeping one record of
 * something they are living through together. It is deliberately not a
 * followers feature — one diary, a handful of people, by invitation only.
 *
 * The screen's job is mostly to be honest about what sharing means, because
 * this is the one decision in the app that cannot be quietly undone. The other
 * person will be able to read what is already in the diary, not only what comes
 * after, and that sentence appears before the code does rather than after.
 *
 * Everything that matters is enforced in SQL. This screen cannot grant access
 * even if it wanted to: joining goes through one function that checks an
 * invitation and nothing else.
 */

interface Diary {
  id: string;
  title: string;
  kind: 'personal' | 'shared';
  ownerId: string;
}

export default function Sharing() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useSession();

  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [members, setMembers] = useState<Record<string, DiaryMember[]>>({});
  const [code, setCode] = useState<string | null>(null);
  const [entered, setEntered] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void (async () => {
      const result = await myDiaries();
      if (!result.ok) return;

      setDiaries(result.value);

      const lists = await Promise.all(
        result.value.map(async (diary) => [diary.id, await diaryMembers(diary.id)] as const),
      );

      setMembers(
        Object.fromEntries(lists.map(([id, result]) => [id, result.ok ? result.value : []])),
      );
    })();
  }, []);

  useEffect(load, [load]);

  const mine = diaries.find((diary) => diary.ownerId === user?.id);
  const theirs = diaries.filter((diary) => diary.ownerId !== user?.id);

  const invite = () => {
    if (mine === undefined) return;

    Alert.alert(
      'Before you send it',
      'Whoever uses this code will be able to read everything already in this diary, not only what you write afterwards. Entries you mark as yours alone stay yours alone.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Make a code',
          onPress: () => {
            void (async () => {
              setBusy(true);
              const result = await createInvite(mine.id);
              setBusy(false);

              if (!result.ok) {
                setNotice(result.error.userMessage);
                return;
              }

              setCode(result.value);
              load();
            })();
          },
        },
      ],
    );
  };

  const join = () => {
    void (async () => {
      setBusy(true);
      setNotice(null);
      const result = await acceptInvite(entered.trim().toUpperCase());
      setBusy(false);

      if (!result.ok) {
        setNotice(result.error.userMessage);
        return;
      }

      setEntered('');
      load();
    })();
  };

  const leave = (diary: Diary) => {
    Alert.alert(
      `Leave ${diary.title}?`,
      'You will not be able to read it any more. Nothing is deleted — what you wrote stays in the diary it was written in.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await leaveDiary(diary.id);
              load();
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen scroll padded>
      <View style={styles.page}>
        <Text variant="title1">Sharing</Text>
        <Text variant="callout" color="inkSecondary">
          A diary can be kept by two people. Anything you mark as yours alone stays yours alone,
          even here.
        </Text>

        {notice !== null && <AuthNotice message={notice} />}

        {mine !== undefined && (
          <>
            <Divider />
            <Text variant="overline" color="inkTertiary">
              Your diary
            </Text>

            {(members[mine.id] ?? []).map((member) => (
              <View key={member.userId} style={styles.row}>
                <Text variant="body">
                  {member.userId === user?.id ? 'You' : (member.displayName ?? 'Someone')}
                </Text>
                <Text variant="caption" color="inkTertiary">
                  {member.role === 'owner' ? 'Owner' : 'Member'}
                </Text>
              </View>
            ))}

            {code === null ? (
              <Button
                label="Invite someone"
                variant="secondary"
                onPress={invite}
                loading={busy}
                fullWidth
              />
            ) : (
              <View
                style={[
                  styles.code,
                  { backgroundColor: theme.colors.accentWash, borderRadius: theme.radius.lg },
                ]}
              >
                <Text variant="overline" color="inkTertiary">
                  Give them this
                </Text>
                <Text variant="title2">{code}</Text>
                {/* Said once, plainly. The account keeps only a hash, so there
                    is genuinely nowhere to look it up again — and a screen that
                    implied otherwise would be setting somebody up to lose it. */}
                <Text variant="caption" color="inkTertiary">
                  It works once, lasts a week, and is not stored anywhere you can read it again.
                  Make another if it gets lost.
                </Text>
                <PressableScale
                  onPress={() => void Clipboard.setStringAsync(code)}
                  haptic="light"
                  accessibilityLabel="Copy the code"
                  style={styles.copy}
                >
                  <Text variant="label" color="accent">
                    Copy
                  </Text>
                </PressableScale>
                <Button label="Done" variant="ghost" onPress={() => setCode(null)} fullWidth />
              </View>
            )}
          </>
        )}

        {theirs.length > 0 && (
          <>
            <Divider />
            <Text variant="overline" color="inkTertiary">
              Shared with you
            </Text>
            {theirs.map((diary) => (
              <View key={diary.id} style={styles.row}>
                <Text variant="body">{diary.title}</Text>
                <PressableScale
                  onPress={() => leave(diary)}
                  haptic="light"
                  accessibilityLabel={`Leave ${diary.title}`}
                  style={styles.copy}
                >
                  <Text variant="caption" color="inkTertiary">
                    Leave
                  </Text>
                </PressableScale>
              </View>
            ))}
          </>
        )}

        <Divider />

        <Text variant="overline" color="inkTertiary">
          Join a diary
        </Text>
        <Field
          label="Their code"
          value={entered}
          onChangeText={setEntered}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="ABCD2345EFGH"
        />
        <Button
          label="Join"
          onPress={join}
          loading={busy}
          disabled={entered.trim().length === 0}
          fullWidth
        />

        <Divider />

        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: { alignItems: 'flex-start', gap: space.xs, padding: space.md },
  copy: { paddingHorizontal: space.xs, paddingVertical: space.xxs },
  page: { gap: space.md, paddingTop: space.xl },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
  },
});
