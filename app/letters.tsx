import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { Button, Chip, Divider, PressableScale, Screen, Text } from '@/components';
import { space, useTheme } from '@/design';
import {
  destroyLetter,
  forgetLetter,
  isOpenable,
  keepOpened,
  listLetters,
  openLetter,
  stillOnThisPhone,
  subscribeToLetters,
  writeLetter,
  type Letter,
} from '@/features/letters';
import { fullDate, toDateKey } from '@/lib/date';
import { logger } from '@/services/logger';

/**
 * Letters to yourself.
 *
 * Write something now that you cannot read until a day you choose. The feature
 * is one property and it is a security property: between writing and that
 * morning, nobody can read it — not another member of a shared diary, not
 * somebody holding a token, and not you, which is the whole point and the part
 * that takes work to mean.
 *
 * The screen is written to tell the truth about that rather than to look
 * reassuring. A letter that has not reached the account yet is still on this
 * phone, and it says so in those words. A sealed one shows when it opens and
 * nothing else, because that is genuinely all this device knows about it.
 *
 * There is no "open it early", and that is not an omission. Destroying one
 * unread is offered instead: she can always change her mind about having
 * written it, just not about when to read it.
 */

const WHENS = [
  { months: 6, label: 'In six months' },
  { months: 12, label: 'In a year' },
  { months: 24, label: 'In two years' },
  { months: 60, label: 'In five years' },
];

function dateInMonths(months: number): string {
  const now = new Date();
  return toDateKey(new Date(now.getFullYear(), now.getMonth() + months, now.getDate()));
}

export default function Letters() {
  const router = useRouter();
  const theme = useTheme();

  const [letters, setLetters] = useState<Letter[]>([]);
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState('');
  const [months, setMonths] = useState(12);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<{ id: string; body: string } | null>(null);

  // Settled once rather than read during render, so a screen left open past
  // midnight does not change which letters it thinks are openable.
  const [todayKey] = useState(() => toDateKey(new Date()));

  const load = useCallback(() => {
    void listLetters().then(setLetters);
  }, []);

  useEffect(() => {
    load();
    return subscribeToLetters(load);
  }, [load]);

  const save = () => {
    if (body.trim().length === 0) return;

    void (async () => {
      setBusy(true);
      await writeLetter({ body: body.trim(), unlockOn: dateInMonths(months) });
      setBusy(false);
      setWriting(false);
      setBody('');
      setMonths(12);
      load();
    })();
  };

  const open = (letter: Letter) => {
    void (async () => {
      setBusy(true);
      const result = await openLetter(letter.id);
      setBusy(false);

      if (!result.ok || result.value === null) {
        Alert.alert(
          'Not yet',
          'This one has not opened yet, or could not be reached. It will be here when it is.',
        );
        return;
      }

      await keepOpened(letter.id, {
        body: result.value.body,
        unlockedAt: result.value.unlockedAt,
      });
      setReading({ id: letter.id, body: result.value.body ?? '' });
      load();
    })();
  };

  const destroy = (letter: Letter) => {
    Alert.alert(
      'Destroy this letter?',
      'It goes without being read, by you or by anyone. There is no undo.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Destroy it',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const result = await destroyLetter(letter.id);
              // A letter that never reached the account has nothing to destroy
              // there, and forgetting it here is the whole of the job.
              if (!result.ok) logger.warn('Could not destroy a letter remotely');
              await forgetLetter(letter.id);
              load();
            })();
          },
        },
      ],
    );
  };

  if (reading !== null) {
    return (
      <Screen scroll padded>
        <View style={styles.page}>
          <Text variant="title1">Dear you</Text>
          <Text
            variant="body"
            style={[styles.letter, { fontFamily: theme.fontFamily.serifRegular }]}
          >
            {reading.body}
          </Text>
          <Button label="Close" variant="secondary" onPress={() => setReading(null)} fullWidth />
        </View>
      </Screen>
    );
  }

  const openable = letters.filter((letter) => isOpenable(letter, todayKey));
  const sealed = letters.filter((letter) => !isOpenable(letter, todayKey));

  return (
    <Screen scroll padded>
      <View style={styles.page}>
        <Text variant="title1">Letters to yourself</Text>
        <Text variant="callout" color="inkSecondary">
          Write something now for a day that has not come yet. Once it reaches your account it is
          sealed — not hidden by the app, actually unreadable, including by you.
        </Text>

        {openable.length > 0 && (
          <>
            <Divider />
            <Text variant="overline" color="inkTertiary">
              Ready for you
            </Text>
            {openable.map((letter) => (
              <View
                key={letter.id}
                style={[
                  styles.card,
                  { backgroundColor: theme.colors.accentWash, borderRadius: theme.radius.lg },
                ]}
              >
                <Text variant="caption" color="inkSecondary">
                  Written {fullDate(new Date(letter.createdAt))}
                </Text>
                <Button label="Open it" onPress={() => open(letter)} loading={busy} fullWidth />
              </View>
            ))}
          </>
        )}

        {sealed.length > 0 && (
          <>
            <Divider />
            <Text variant="overline" color="inkTertiary">
              Waiting
            </Text>
            {sealed.map((letter) => (
              <View key={letter.id} style={styles.row}>
                <View style={styles.rowText}>
                  <Text variant="label">
                    Opens {fullDate(new Date(`${letter.unlockOn}T12:00`))}
                  </Text>
                  {/* The one thing this screen must not be vague about. Until
                      the letter reaches the account its body is in storage on
                      this phone, and saying "sealed" would be the single lie
                      the feature cannot afford. */}
                  <Text variant="caption" color="inkTertiary">
                    {stillOnThisPhone(letter)
                      ? 'Still on this phone until it reaches your account'
                      : 'Sealed'}
                  </Text>
                </View>
                <PressableScale
                  onPress={() => destroy(letter)}
                  haptic="light"
                  accessibilityLabel="Destroy this letter unread"
                  style={styles.destroy}
                >
                  <Text variant="caption" color="inkTertiary">
                    Destroy
                  </Text>
                </PressableScale>
              </View>
            ))}
          </>
        )}

        <Divider />

        {writing ? (
          <View style={styles.form}>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Dear you…"
              placeholderTextColor={theme.colors.inkFaint}
              multiline
              autoFocus
              textAlignVertical="top"
              style={[
                styles.writing,
                { color: theme.colors.ink, fontFamily: theme.fontFamily.serifRegular },
              ]}
              accessibilityLabel="Your letter"
            />

            <Text variant="overline" color="inkTertiary">
              When should it open
            </Text>
            <View style={styles.chips}>
              {WHENS.map((option) => (
                <Chip
                  key={option.months}
                  label={option.label}
                  selected={months === option.months}
                  onPress={() => setMonths(option.months)}
                />
              ))}
            </View>
            <Text variant="caption" color="inkTertiary">
              It opens on {fullDate(new Date(`${dateInMonths(months)}T12:00`))}. You will not be
              able to read it before then, and neither will anyone else.
            </Text>

            <Button
              label="Seal it"
              onPress={save}
              loading={busy}
              disabled={body.trim().length === 0}
              fullWidth
            />
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => {
                setWriting(false);
                setBody('');
              }}
              fullWidth
            />
          </View>
        ) : (
          <Button
            label="Write one"
            variant="secondary"
            onPress={() => setWriting(true)}
            fullWidth
          />
        )}

        <Divider />

        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  destroy: { paddingHorizontal: space.xs, paddingVertical: space.xxs },
  form: { gap: space.sm },
  letter: { fontSize: 19, lineHeight: 32 },
  page: { gap: space.md, paddingTop: space.xl },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  rowText: { flex: 1, gap: space.xxs },
  writing: { fontSize: 19, lineHeight: 32, minHeight: 180, padding: 0 },
});
