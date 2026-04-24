import { Tabs } from 'expo-router'
import { Platform, View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocale } from '@/contexts/locale-context'
import { useNavigationLoader } from '@/contexts/navigation-loader-context'
import { useNotifications } from '@/contexts/notification-context'
import { Colors } from '@/theme'

function NotifBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
    </View>
  )
}

export default function TabsLayout() {
  const { t } = useLocale()
  const { unreadCount } = useNotifications()
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
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarIcon: ({ color, focused }) => (
            <View>
              <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={24} color={color} />
              <NotifBadge count={unreadCount} />
            </View>
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
      <Tabs.Screen name="index"        options={{ href: null }} />
      <Tabs.Screen name="events/index" options={{ href: null }} />
      <Tabs.Screen name="feed"         options={{ href: null }} />
      <Tabs.Screen name="chat"         options={{ href: null }} />
      <Tabs.Screen name="saved"        options={{ href: null }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.brand[500],
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
})
