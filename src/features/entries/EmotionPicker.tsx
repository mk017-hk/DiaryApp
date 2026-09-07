import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip, PressableScale, Text } from '@/components';
import { space } from '@/design';
import { DEFAULT_EMOTIONS, emotionIndex, type Emotion } from '@/services/supabase/emotions';

interface EmotionPickerProps {
  selected: string[];
  onChange: (slugs: string[]) => void;
}

/** Six to start with; the rest are one tap away. */
const INITIAL_VISIBLE = 6;

/**
 * The six shown before you ask for more, taken one family at a time.
 *
 * Not the first six by sort order. The vocabulary is seeded warm-first, so
 * that version showed Happy, Loved, Grateful, Excited, Calm and Peaceful —
 * six pleasant words, with every difficult one hidden behind "More". Someone
 * having the worst week of their year would have had to go looking for the
 * word for it, past a row of feelings they did not have.
 *
 * Taking one from each family in turn puts a heavy word and a restless one on
 * screen from the start. That is the whole point: no feeling here is the wrong
 * answer, and the layout has to say so before the copy gets a chance to.
 */
function balancedFew(options: Emotion[]): string[] {
  const byFamily = new Map<string, Emotion[]>();
  for (const option of options) {
    byFamily.set(option.family, [...(byFamily.get(option.family) ?? []), option]);
  }

  const families = [...byFamily.values()];
  const picked: string[] = [];

  for (let round = 0; picked.length < INITIAL_VISIBLE; round += 1) {
    const before = picked.length;

    for (const family of families) {
      const option = family[round];
      if (option !== undefined && picked.length < INITIAL_VISIBLE) picked.push(option.slug);
    }

    // Every family exhausted — there are simply fewer than six to show.
    if (picked.length === before) break;
  }

  return picked;
}

/**
 * Naming what a day felt like.
 *
 * Optional, always. Nothing here is required to save an entry, nothing counts
 * how often you pick one, and the families are not ordered from good to bad —
 * they are ordered so related words sit together. A picker that made "Sad"
 * look like the wrong answer would be the opposite of what this app is for.
 *
 * Collapsed to six by default. Thirteen chips is a form; six is a question.
 */
export function EmotionPicker({ selected, onChange }: EmotionPickerProps) {
  const [options, setOptions] = useState<Emotion[]>(DEFAULT_EMOTIONS);
  const [expanded, setExpanded] = useState(false);

  // The seeded list is the floor, so the picker works offline and on first
  // launch. The server's is authoritative when it answers.
  useEffect(() => {
    let cancelled = false;
    void emotionIndex().then((index) => {
      if (!cancelled && index.list.length > 0) setOptions(index.list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (slug: string) =>
    onChange(
      selected.includes(slug) ? selected.filter((value) => value !== slug) : [...selected, slug],
    );

  const few = useMemo(() => new Set(balancedFew(options)), [options]);

  // A chosen emotion stays visible even when it lives past the fold, or
  // collapsing the list would hide something you had picked.
  const visible = expanded
    ? options
    : options.filter((option) => few.has(option.slug) || selected.includes(option.slug));

  return (
    <View style={styles.section}>
      <Text variant="overline" color="inkTertiary">
        Anything you want to name?
      </Text>

      <View style={styles.chips}>
        {visible.map((option) => (
          <Chip
            key={option.slug}
            label={option.label}
            selected={selected.includes(option.slug)}
            onPress={() => toggle(option.slug)}
          />
        ))}
      </View>

      {!expanded && options.length > visible.length && (
        <PressableScale
          onPress={() => setExpanded(true)}
          haptic="light"
          accessibilityLabel="Show more feelings"
          style={styles.more}
        >
          <Text variant="caption" color="accent">
            More
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  more: { alignSelf: 'flex-start', paddingVertical: space.xxs },
  section: { gap: space.xs, marginTop: space.lg },
});

/** Exposed so the balance of the collapsed row can be asserted directly. */
export const __testing = { balancedFew };
