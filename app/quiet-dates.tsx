import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Chip, Divider, Field, PressableScale, Screen, Text } from '@/components';
import { space, useTheme } from '@/design';
import {
  addQuietDates,
  listQuietDates,
  rangeAround,
  removeQuietDates,
  subscribeToMutes,
  type QuietDates,
} from '@/features/entries';

/**
 * Quiet dates.
 *
 * The app's best feature and its most dangerous one are the same feature.
 * "Two years ago today" is what turns a notebook into an archive, and it is
 * also perfectly capable of handing someone the worst morning of her year
 * without being asked. The app has no way of knowing which mornings those are.
 * She does. This is where she says so.
 *
 * Written to be used once, on a difficult afternoon, and then not thought about
 * again. So: no explaining, no asking why, no confirmation step that makes
 * somebody state their reason to a phone. Choose the date, choose how wide, and
 * it is done.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Enough for any month; February's 30th simply never gets offered. */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const SPREADS = [
  { days: 0, label: 'Just that day' },
  { days: 3, label: 'That week' },
  { days: 7, label: 'Two weeks' },
];

type Range = Pick<QuietDates, 'fromMonth' | 'fromDay' | 'toMonth' | 'toDay'>;

function describe(mute: Range): string {
  const from = `${String(mute.fromDay)} ${MONTHS[mute.fromMonth - 1] ?? ''}`;
  const to = `${String(mute.toDay)} ${MONTHS[mute.toMonth - 1] ?? ''}`;
  return from === to ? from : `${from} – ${to}`;
}

export default function QuietDatesScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [mutes, setMutes] = useState<QuietDates[]>([]);
  const [adding, setAdding] = useState(false);
  const [month, setMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [spread, setSpread] = useState(3);
  const [label, setLabel] = useState('');

  const load = useCallback(() => {
    void listQuietDates().then(setMutes);
  }, []);

  // Subscribed rather than loaded on focus, so a mute arriving from the other
  // phone mid-sync appears here without a navigation.
  useEffect(() => {
    load();
    return subscribeToMutes(load);
  }, [load]);

  const reset = () => {
    setAdding(false);
    setMonth(null);
    setDay(null);
    setSpread(3);
    setLabel('');
  };

  const save = () => {
    if (month === null || day === null) return;

    void (async () => {
      await addQuietDates({
        ...rangeAround(month, day, spread),
        ...(label.trim().length > 0 ? { label: label.trim() } : {}),
      });
      load();
      reset();
    })();
  };

  const lift = (id: string) => {
    void (async () => {
      await removeQuietDates(id);
      load();
    })();
  };

  return (
    <Screen scroll padded>
      <View style={styles.page}>
        <Text variant="title1">Quiet dates</Text>
        <Text variant="callout" color="inkSecondary">
          Some days should not arrive with a memory attached. Tell me which ones and I will not
          bring anything back from them — not this year, not any year.
        </Text>

        {mutes.length > 0 && (
          <View style={styles.list}>
            {mutes.map((mute) => (
              <View
                key={mute.id}
                style={[
                  styles.row,
                  { backgroundColor: theme.colors.accentWash, borderRadius: theme.radius.md },
                ]}
              >
                <View style={styles.rowText}>
                  <Text variant="label">{describe(mute)}</Text>
                  {mute.label !== undefined && (
                    <Text variant="caption" color="inkTertiary">
                      {mute.label}
                    </Text>
                  )}
                </View>
                <PressableScale
                  onPress={() => lift(mute.id)}
                  haptic="light"
                  accessibilityLabel={`Lift the quiet dates ${describe(mute)}`}
                  style={styles.lift}
                >
                  <Text variant="caption" color="inkTertiary">
                    Lift
                  </Text>
                </PressableScale>
              </View>
            ))}
          </View>
        )}

        <Divider />

        {adding ? (
          <View style={styles.form}>
            <Text variant="overline" color="inkTertiary">
              Which month
            </Text>
            <View style={styles.chips}>
              {MONTHS.map((name, index) => (
                <Chip
                  key={name}
                  label={name}
                  selected={month === index + 1}
                  onPress={() => {
                    setMonth(index + 1);
                    // A day that does not exist in the new month would silently
                    // become one that does.
                    if (day !== null && day > (DAYS_IN_MONTH[index] ?? 31)) setDay(null);
                  }}
                />
              ))}
            </View>

            {month !== null && (
              <>
                <Text variant="overline" color="inkTertiary">
                  Which day
                </Text>
                <View style={styles.chips}>
                  {Array.from({ length: DAYS_IN_MONTH[month - 1] ?? 31 }, (_, index) => (
                    <Chip
                      key={index + 1}
                      label={String(index + 1)}
                      selected={day === index + 1}
                      onPress={() => setDay(index + 1)}
                    />
                  ))}
                </View>
              </>
            )}

            {day !== null && (
              <>
                <Text variant="overline" color="inkTertiary">
                  How much around it
                </Text>
                <View style={styles.chips}>
                  {SPREADS.map((option) => (
                    <Chip
                      key={option.days}
                      label={option.label}
                      selected={spread === option.days}
                      onPress={() => setSpread(option.days)}
                    />
                  ))}
                </View>

                {month !== null && (
                  <Text variant="caption" color="inkTertiary">
                    Nothing will be resurfaced from {describe(rangeAround(month, day, spread))}, in
                    any year.
                  </Text>
                )}

                {/* Optional, and it stays optional. Being made to write down
                    why is its own small cost, on exactly the subject where
                    that cost is highest. */}
                <Field
                  label="A note, if you want one"
                  value={label}
                  onChangeText={setLabel}
                  placeholder="Only you will see this"
                />
              </>
            )}

            <Button
              label="Keep these dates quiet"
              onPress={save}
              disabled={month === null || day === null}
              fullWidth
            />
            <Button label="Cancel" variant="ghost" onPress={reset} fullWidth />
          </View>
        ) : (
          <Button
            label="Add quiet dates"
            variant="secondary"
            onPress={() => setAdding(true)}
            fullWidth
          />
        )}

        <Divider />

        <Text variant="caption" color="inkTertiary">
          This changes what the app shows you, not what it keeps. Everything you have written is
          still there, and still yours to go and read whenever you want to.
        </Text>

        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  form: { gap: space.sm },
  lift: { paddingHorizontal: space.xs, paddingVertical: space.xxs },
  list: { gap: space.xs },
  page: { gap: space.md, paddingTop: space.xl },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  rowText: { flex: 1, gap: space.xxs },
});
