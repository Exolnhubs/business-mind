import { Tabs } from 'expo-router'
import { Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocale } from '@/contexts/locale-context'
import { Colors } from '@/theme'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

export default function TabsLayout() {
  const { t } = useLocale()

  const tab = (
    name: string,
    href: string,
    activeIcon: IoniconName,
    inactiveIcon: IoniconName,
    label: string,
  ) => ({
    name,
    options: {
      title: label,
      tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
        <Ionicons name={focused ? activeIcon : inactiveIcon} size={24} color={color} />
      ),
    },
  })

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.brand[500],
        tabBarInactiveTintColor: Colors.gray[400],
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.gray[100],
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        headerStyle: { backgroundColor: Colors.white },
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerShadowVisible: false,
        headerTintColor: Colors.gray[900],
      }}
    >
      <Tabs.Screen
        name="events/index"
        options={{
          title: t('tab.events'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t('tab.bookings'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'ticket' : 'ticket-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('tab.chat'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab.profile'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
