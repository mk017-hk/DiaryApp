import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components';
import { fontFamily, useTheme } from '@/design';

/**
 * Five tabs.
 *
 * Today is where the day is: the cycle, the question, the check-in. The
 * calendar is how you go back. Insights is what it all looks like from a
 * distance. Ask is the assistant. You is everything that belongs to you rather
 * than to a day — the lock, letters, sharing, export, your account.
 *
 * Icons with words under them, because five destinations is enough that an
 * icon alone would have somebody guessing.
 */
const TABS = [
  {
    name: 'index',
    title: 'Today',
    icon: 'white-balance-sunny',
    iconFocused: 'white-balance-sunny',
  },
  {
    name: 'calendar',
    title: 'Calendar',
    icon: 'calendar-blank-outline',
    iconFocused: 'calendar-blank',
  },
  { name: 'insights', title: 'Insights', icon: 'chart-box-outline', iconFocused: 'chart-box' },
  { name: 'ask', title: 'Ask', icon: 'chat-outline', iconFocused: 'chat' },
  { name: 'you', title: 'You', icon: 'account-circle-outline', iconFocused: 'account-circle' },
] as const;

export default function AppTabs() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.inkTertiary,
        tabBarLabelStyle: { fontFamily: fontFamily.sansMedium, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          height: 58 + insets.bottom,
          paddingTop: 6,
        },
        sceneStyle: { backgroundColor: theme.colors.canvas },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: tab.title,
            tabBarIcon: ({ focused }) => (
              <Icon
                name={focused ? tab.iconFocused : tab.icon}
                size={24}
                color={focused ? 'accent' : 'inkTertiary'}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
