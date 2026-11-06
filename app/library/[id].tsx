import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, PressableScale, Screen, Text } from '@/components';
import { space, useTheme } from '@/design';
import { getArticle } from '@/features/library';

/** One short read from the library. */
export default function ArticleScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const article = typeof id === 'string' ? getArticle(id) : undefined;

  return (
    <Screen scroll padded>
      <View style={styles.page}>
        <PressableScale onPress={() => router.back()} accessibilityLabel="Back" style={styles.back}>
          <Icon name="chevron-left" size={28} color="ink" />
        </PressableScale>

        {article === undefined ? (
          <Text variant="callout" color="inkSecondary">
            This page could not be found.
          </Text>
        ) : (
          <>
            <View style={[styles.icon, { backgroundColor: theme.colors.accentWash }]}>
              <Icon name={article.icon} size={28} color="accent" />
            </View>
            <Text variant="title1" accessibilityRole="header">
              {article.title}
            </Text>
            {article.body.map((paragraph) => (
              <Text key={paragraph.slice(0, 32)} variant="body" color="inkSecondary">
                {paragraph}
              </Text>
            ))}
            <Text variant="caption" color="inkTertiary">
              General information, not medical advice.
            </Text>
            <Button
              label="If you need someone"
              variant="secondary"
              onPress={() => router.push('/support')}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start' },
  icon: { alignItems: 'center', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  page: { gap: space.md, paddingBottom: space.xxl, paddingTop: space.md },
});
