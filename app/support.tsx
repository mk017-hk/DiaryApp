import { useRouter } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import { Button, Divider, PressableScale, Screen, Text } from '@/components';
import { space } from '@/design';

/**
 * Real help, from people who are actually qualified to give it.
 *
 * Reachable from Settings without hunting, and shown directly if the assistant
 * ever sees something it must not try to handle. It deliberately does not
 * counsel, reassure, or ask a follow-up question — a diary app attempting any
 * of that at the moment somebody most needs help would be worse than saying
 * nothing at all.
 *
 * UK numbers, because that is where this is being built and a list of numbers
 * for the wrong country is not help. Widening it is a real task, not a
 * copy edit: every line here has to be one somebody can actually ring.
 */

interface Resource {
  name: string;
  what: string;
  how: string;
  action?: { label: string; url: string };
}

const RESOURCES: Resource[] = [
  {
    name: 'Samaritans',
    what: 'Any time, about anything. Free, day or night.',
    how: '116 123',
    action: { label: 'Call 116 123', url: 'tel:116123' },
  },
  {
    name: 'Shout',
    what: 'If talking out loud is too much. Text-based, free, day or night.',
    how: 'Text SHOUT to 85258',
    action: { label: 'Text SHOUT', url: 'sms:85258&body=SHOUT' },
  },
  {
    name: 'Tommy’s',
    what: 'Pregnancy loss, baby loss and complicated pregnancies. Midwives, not a call centre.',
    how: '0800 014 7800, weekdays',
    action: { label: 'Call Tommy’s', url: 'tel:08000147800' },
  },
  {
    name: 'Refuge',
    what: 'Domestic abuse. Free, 24 hours.',
    how: '0808 2000 247',
    action: { label: 'Call Refuge', url: 'tel:08082000247' },
  },
  {
    name: 'NHS 111',
    what: 'Urgent but not life-threatening. They will tell you where to go.',
    how: '111',
    action: { label: 'Call 111', url: 'tel:111' },
  },
];

/** Narrows the optional action for the press handler. */
const action = (resource: Resource): string => resource.action?.url ?? '';

export default function Support() {
  const router = useRouter();

  return (
    <Screen scroll padded>
      <View style={styles.page}>
        <Text variant="title1">If you need someone</Text>
        <Text variant="callout" color="inkSecondary">
          This app is a place to put things down. It is not a person, and some things need a person.
          These are ones you can reach now.
        </Text>

        <Divider />

        {RESOURCES.map((resource) => (
          <View key={resource.name} style={styles.resource}>
            <Text variant="title3">{resource.name}</Text>
            <Text variant="callout" color="inkSecondary">
              {resource.what}
            </Text>
            <Text variant="caption" color="inkTertiary">
              {resource.how}
            </Text>
            {resource.action !== undefined && (
              <PressableScale
                onPress={() => void Linking.openURL(action(resource))}
                haptic="light"
                accessibilityLabel={resource.action.label}
                style={styles.action}
              >
                <Text variant="label" color="accent">
                  {resource.action.label}
                </Text>
              </PressableScale>
            )}
          </View>
        ))}

        <Divider />

        <Text variant="caption" color="inkTertiary">
          If someone is in immediate danger, ring 999.
        </Text>

        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: { alignSelf: 'flex-start', paddingVertical: space.xxs },
  page: { gap: space.md, paddingTop: space.xl },
  resource: { gap: space.xxs, paddingVertical: space.sm },
});
