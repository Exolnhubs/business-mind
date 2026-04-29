import { Tabs } from 'expo-router'
import { Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocale } from '@/contexts/locale-context'
import { useNavigationLoader } from '@/contexts/navigation-loader-context'
import { Colors } from '@/theme'

export default function TabsLayout() {
  const { t } = useLocale()
  const { beginNavigation, endNavigation } = useNavigationLoader()

  return (
    <Tabs
      initialRouteName="home"
      screenListeners={{
        transitionStart: () => beginNavigation(),
        transitionEnd: () => endNavigation(),
      }}
      screenOptions={{
        tabBarActiveTintColor: Colors.brand[500],
        tabBarInactiveTintColor: Colors.gray[400],
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.gray[100],
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 62,
          paddingBottom: Platform.OS === 'ios' ? 26 : 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        headerStyle: { backgroundColor: Colors.white },
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerShadowVisible: false,
        headerTintColor: Colors.gray[900],
      }}
    >
      {/* ── Visible tabs ────────────────────────────────────── */}
      <Tabs.Screen
        name="home"
        options={{
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={24} color={color} />
          ),
          title: t('tab.events'),
        }}
      />
      <Tabs.Screen
        name="happenings"
        options={{
          title: 'Happenings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'radio' : 'radio-outline'} size={24} color={color} />
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
        name="profile"
        options={{
          title: t('tab.profile'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={24} color={color} />
          ),
        }}
      />

      {/* ── Hidden routes ───────────────────────────────────── */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="index"        options={{ href: null }} />
      <Tabs.Screen name="feed"         options={{ href: null }} />
      <Tabs.Screen name="chat"         options={{ href: null }} />
      <Tabs.Screen name="saved"        options={{ href: null }} />
    </Tabs>
  )
}

