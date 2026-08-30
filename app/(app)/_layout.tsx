import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { useTheme } from '@/design';

/**
 * Two tabs, not five.
 *
 * Today is where you answer; the calendar is how you go back. Everything else
 * belongs inside one of those. A row of five icons would make this look like
 * an app for managing things rather than a place to keep them.
 */
export default function AppTabs() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.canvas,
          borderTopColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          height: 84,
          paddingTop: 10,
        },
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: theme.colors.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ focused }) => <TabLabel label="Today" focused={focused} />,
          tabBarAccessibilityLabel: 'Today',
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ focused }) => <TabLabel label="Calendar" focused={focused} />,
          tabBarAccessibilityLabel: 'Calendar',
        }}
      />
    </Tabs>
  );
}

/** Words rather than icons: two destinations do not need a pictogram, and the
 *  serif label keeps the tab bar in the same voice as the rest of the app. */
function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={styles.tab}>
      <Text variant="title3" color={focused ? 'ink' : 'inkFaint'}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { alignItems: 'center', justifyContent: 'center', minWidth: 100 },
});
