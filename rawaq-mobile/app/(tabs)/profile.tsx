import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Switch, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth()
  const { t, locale, toggleLocale } = useLocale()
  const router = useRouter()
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [signingOut, setSigningOut]   = useState(false)

  useEffect(() => {
    if (!user) return
    // Check if a push token is registered
    supabase
      .from('device_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()
      .then(({ data }) => setPushEnabled(!!data))
  }, [user])

  async function togglePush(enabled: boolean) {
    if (!user) return
    setPushLoading(true)

    if (enabled) {
      if (!Device.isDevice) {
        Alert.alert('Push notifications require a real device')
        setPushLoading(false)
        return
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      let finalStatus = existingStatus
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }
      if (finalStatus !== 'granted') {
        Alert.alert('Notifications blocked', 'Enable notifications in your device settings.')
        setPushLoading(false)
        return
      }

      const token = await Notifications.getExpoPushTokenAsync()
      await supabase.from('device_tokens').upsert({
        user_id: user.id,
        token: token.data,
        platform: Platform.OS as 'ios' | 'android',
        is_active: true,
      }, { onConflict: 'user_id,token' })

      setPushEnabled(true)
    } else {
      await supabase
        .from('device_tokens')
        .update({ is_active: false })
        .eq('user_id', user.id)
      setPushEnabled(false)
    }

    setPushLoading(false)
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true)
          await signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 48 }}>👤</Text>
        <Text style={styles.guestTitle}>You're not signed in</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.btnText}>{t('auth.login')}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const initials = (profile?.display_name ?? user.email ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar & name */}
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.displayName}>{profile?.display_name ?? 'User'}</Text>
        <Text style={styles.email}>{user.email}</Text>
        {profile?.city && <Text style={styles.city}>📍 {profile.city}</Text>}
        {profile?.role === 'organizer' && (
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>🏢 Organizer</Text>
          </View>
        )}
        {profile?.role === 'admin' && (
          <View style={[styles.roleBadge, { backgroundColor: Colors.red.light }]}>
            <Text style={[styles.roleBadgeText, { color: Colors.red.text }]}>🛡️ Admin</Text>
          </View>
        )}
      </View>

      {/* Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>

        {/* Language */}
        <TouchableOpacity style={styles.row} onPress={toggleLocale}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowIcon}>🌐</Text>
            <Text style={styles.rowLabel}>Language</Text>
          </View>
          <Text style={styles.rowValue}>{locale === 'en' ? 'English' : 'العربية'}</Text>
        </TouchableOpacity>

        {/* Push notifications */}
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowIcon}>🔔</Text>
            <Text style={styles.rowLabel}>Push Notifications</Text>
          </View>
          {pushLoading
            ? <ActivityIndicator size="small" color={Colors.brand[500]} />
            : <Switch
              value={pushEnabled}
              onValueChange={togglePush}
              trackColor={{ false: Colors.gray[200], true: Colors.brand[400] }}
              thumbColor={pushEnabled ? Colors.brand[500] : Colors.gray[400]}
            />
          }
        </View>
      </View>

      {/* Quick links */}
      {profile?.role === 'organizer' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Organizer</Text>
          <TouchableOpacity style={styles.row} onPress={() => {}}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>📊</Text>
              <Text style={styles.rowLabel}>Dashboard (Web)</Text>
            </View>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} disabled={signingOut}>
        {signingOut
          ? <ActivityIndicator color={Colors.red.text} />
          : <Text style={styles.signOutText}>🚪 {t('profile.logout')}</Text>
        }
      </TouchableOpacity>

      <Text style={styles.version}>Rawaq v1.0.0</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  content: { paddingBottom: Spacing['4xl'] },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.lg, padding: Spacing['3xl'] },
  guestTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.gray[800] },
  btn: { backgroundColor: Colors.brand[500], borderRadius: Radius.lg, paddingHorizontal: Spacing['3xl'], paddingVertical: Spacing.md },
  btnText: { color: Colors.white, fontWeight: FontWeight.semibold },
  hero: { backgroundColor: Colors.white, alignItems: 'center', paddingTop: Spacing['3xl'], paddingBottom: Spacing['2xl'], borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md },
  avatarText: { fontSize: 28, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  displayName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  email: { fontSize: FontSize.sm, color: Colors.gray[500], marginTop: 4 },
  city: { fontSize: FontSize.sm, color: Colors.gray[500], marginTop: 4 },
  roleBadge: { marginTop: Spacing.sm, backgroundColor: Colors.brand[50], borderRadius: Radius.full, paddingHorizontal: Spacing.lg, paddingVertical: 4 },
  roleBadgeText: { fontSize: FontSize.sm, color: Colors.brand[700], fontWeight: FontWeight.semibold },
  section: { margin: Spacing.lg, backgroundColor: Colors.white, borderRadius: Radius.lg, overflow: 'hidden', ...Shadow.card },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.gray[50] },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  rowIcon: { fontSize: 20 },
  rowLabel: { fontSize: FontSize.base, color: Colors.gray[800] },
  rowValue: { fontSize: FontSize.sm, color: Colors.gray[500] },
  rowArrow: { fontSize: 22, color: Colors.gray[400] },
  signOutBtn: { margin: Spacing.lg, backgroundColor: Colors.white, borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center', ...Shadow.card },
  signOutText: { fontSize: FontSize.base, color: Colors.red.text, fontWeight: FontWeight.medium },
  version: { textAlign: 'center', fontSize: FontSize.xs, color: Colors.gray[300], marginBottom: Spacing.xl },
})
