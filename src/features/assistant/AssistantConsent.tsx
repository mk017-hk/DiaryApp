import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Divider, PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import { readConsent, setConsent } from '@/services/supabase/assistant';

/**
 * Turning the assistant on and off, after onboarding.
 *
 * Onboarding is where the question is properly asked; this is where it can be
 * changed, which is not the same thing and should not pretend to be. It states
 * what is read and what never is, because a settings row saying "AI: on" is
 * not a description of anything.
 */
export function AssistantConsent() {
  const theme = useTheme();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readConsent().then((consent) => {
      if (!cancelled) setEnabled(consent?.enabled ?? false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing rather than a row that flickers from off to on a moment later.
  if (enabled === null) return null;

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    void setConsent(next).then((ok) => {
      setSaving(false);
      // Put it back rather than showing a state the server did not accept.
      if (!ok) setEnabled(!next);
    });
  };

  return (
    <View style={styles.section}>
      <Divider />

      <Text variant="overline" color="inkTertiary">
        The assistant
      </Text>

      <Text variant="caption" color="inkTertiary">
        {enabled
          ? 'It reads what you write, so it can ask better questions. Only the words — never your video or your voice. Any entry can be held back, and any thread marked private is skipped entirely.'
          : 'Off. Nothing you write is read, and the daily question comes from a fixed set rather than from you.'}
      </Text>

      <PressableScale
        onPress={toggle}
        haptic="selection"
        disabled={saving}
        accessibilityLabel={enabled ? 'Turn the assistant off' : 'Turn the assistant on'}
        accessibilityState={{ checked: enabled }}
        style={[
          styles.toggle,
          {
            backgroundColor: enabled ? theme.colors.accentWash : theme.colors.surfaceMuted,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <Text variant="label" color={enabled ? 'accent' : 'inkSecondary'}>
          {enabled ? '✓ On' : 'Off'}
        </Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.xs },
  toggle: { alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: space.xs },
});
