import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PressableScale, Text } from '@/components';
import { space, useTheme } from '@/design';
import {
  askAssistant,
  dismissMessage,
  latestMessage,
  type AssistantMessage,
} from '@/services/supabase/assistant';

interface AssistantQuestionProps {
  /** Used when the assistant has nothing to say, which is most days. */
  fallback: string;
}

/**
 * The question at the top of Today.
 *
 * Falls back to the templated pool whenever the assistant is off, silent, or
 * unreachable — which is the ordinary case, not the exception. A diary that
 * showed a spinner or an error where the question goes would be worse than one
 * that simply asks something reasonable.
 *
 * When there *is* a real question, it comes with what it was drawn from. That
 * is the honesty feature of this app: a person can always see which of their
 * own entries produced it, and go and read them.
 */
export function AssistantQuestion({ fallback }: AssistantQuestionProps) {
  const theme = useTheme();
  const router = useRouter();

  const [message, setMessage] = useState<AssistantMessage | null>(null);
  const [showingSources, setShowingSources] = useState(false);
  const [support, setSupport] = useState(false);

  const load = useCallback(async () => {
    // What is already there first — instant, and correct if we asked earlier
    // today. Only then does it consider asking for a new one.
    const existing = await latestMessage();
    if (existing !== null) {
      setMessage(existing);
      return;
    }

    const outcome = await askAssistant();
    if (outcome.kind === 'question') {
      setMessage(await latestMessage());
    } else if (outcome.kind === 'support') {
      setSupport(true);
    }
  }, []);

  // A focus effect rather than a plain one: the question should be re-checked
  // when you come back to Today, and this keeps the state updates out of an
  // effect body where they would cascade.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Something in the writing described a crisis. The app does not attempt to
  // respond to it; it points at people who can.
  if (support) {
    return (
      <Animated.View entering={FadeIn.duration(400)}>
        <Text variant="display" lineHeight={46}>
          {fallback}
        </Text>
        <PressableScale
          onPress={() => router.push('/support')}
          haptic="light"
          accessibilityLabel="Find someone to talk to"
          style={[
            styles.support,
            { backgroundColor: theme.colors.accentWash, borderRadius: theme.radius.lg },
          ]}
        >
          <Text variant="callout" color="inkSecondary">
            If you want to talk to someone who is not an app, there are people here.
          </Text>
        </PressableScale>
      </Animated.View>
    );
  }

  if (message === null) {
    return (
      <Text variant="display" lineHeight={46}>
        {fallback}
      </Text>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text variant="display" lineHeight={46}>
        {message.content}
      </Text>

      <View style={styles.meta}>
        {message.basedOn.length > 0 && (
          <PressableScale
            onPress={() => setShowingSources(!showingSources)}
            haptic="light"
            accessibilityLabel="See what this was drawn from"
            style={styles.metaButton}
          >
            <Text variant="caption" color="inkTertiary">
              {showingSources
                ? 'Hide what this came from'
                : `From ${String(message.basedOn.length)} of your own ${
                    message.basedOn.length === 1 ? 'entry' : 'entries'
                  }`}
            </Text>
          </PressableScale>
        )}

        <PressableScale
          onPress={() => {
            setMessage(null);
            void dismissMessage(message.id);
          }}
          haptic="light"
          accessibilityLabel="Put this question away"
          style={styles.metaButton}
        >
          <Text variant="caption" color="inkFaint">
            Not today
          </Text>
        </PressableScale>
      </View>

      {/* The sources, openable. Naming a count would be a claim; letting
          somebody go and read them is the proof. */}
      {showingSources && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.sources}>
          {message.basedOn.map((entryId, index) => (
            <PressableScale
              key={entryId}
              onPress={() => router.push(`/entry/${entryId}`)}
              haptic="light"
              accessibilityLabel={`Open the entry this was drawn from, number ${String(index + 1)}`}
              style={styles.sourceRow}
            >
              <Text variant="caption" color="accent">
                Something you wrote ›
              </Text>
            </PressableScale>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', gap: space.lg, marginTop: space.xs },
  metaButton: { paddingVertical: space.xxs },
  sourceRow: { paddingVertical: space.xxs },
  sources: { gap: space.xxs, marginTop: space.xs },
  support: { marginTop: space.md, padding: space.md },
  wrap: { gap: space.xxs },
});
