import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Switch, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
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

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk', 'Abha', 'Taif']
const GENDER_OPTIONS: { label: string; value: 'male' | 'female' }[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
]

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const { t, locale, toggleLocale } = useLocale()
  const router = useRouter()
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [signingOut, setSigningOut]   = useState(false)

  // Edit form
  const [editing, setEditing]         = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [city, setCity]               = useState('')
  const [bio, setBio]                 = useState('')
  const [phone, setPhone]             = useState('')
  const [gender, setGender]           = useState<'male' | 'female' | ''>('')
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState<{ ok: boolean; text: string } | null>(null)

  // Email change form
  const [newEmail, setNewEmail]       = useState('')
  const [emailChanging, setEmailChanging] = useState(false)
  const [emailMsg, setEmailMsg]       = useState<{ ok: boolean; text: string } | null>(null)

  // Populate form from profile
  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name ?? '')
    setCity(profile.city ?? '')
    setBio((profile as Record<string, unknown>).bio as string ?? '')
    setGender((profile.gender as 'male' | 'female' | '') ?? '')
    setPhone((profile as Record<string, unknown>).phone as string ?? '')
  }, [profile])

  useEffect(() => {
    if (!user) return
    supabase
      .from('device_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()
      .then(({ data }) => setPushEnabled(!!data))
  }, [user])

  async function saveProfile() {
    if (!user) return
    setSaving(true)
    setSaveMsg(null)

    const body: Record<string, unknown> = {
      display_name: displayName || null,
      city: city || null,
      bio: bio || null,
      phone: phone || null,
    }
    // Only send gender if not yet set — server also locks it, but avoid unnecessary request
    if (!profile?.gender && gender) {
      body.gender = gender
    }

    const { error } = await supabase
      .from('profiles')
      .update(body)
      .eq('id', user.id)

    if (error) {
      setSaveMsg({ ok: false, text: error.message })
    } else {
      await refreshProfile()
      setSaveMsg({ ok: true, text: t('profile.saved') })
      setEditing(false)
    }
    setSaving(false)
  }

  async function handleEmailChange() {
    const trimmed = newEmail.trim()
    if (!trimmed || trimmed === user?.email) return
    setEmailChanging(true)
    setEmailMsg(null)
    const { error } = await supabase.auth.updateUser({ email: trimmed })
    if (error) {
      setEmailMsg({ ok: false, text: error.message })
    } else {
      setEmailMsg({ ok: true, text: `Confirmation sent to ${trimmed}. Tap the link in that email to confirm.` })
      setNewEmail('')
    }
    setEmailChanging(false)
  }

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

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        (Constants as Record<string, Record<string, Record<string, string>>>).easConfig?.projectId

      let token: Awaited<ReturnType<typeof Notifications.getExpoPushTokenAsync>>
      try {
        token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {})
      } catch {
        Alert.alert('Push notifications unavailable', 'Could not register this device.')
        setPushLoading(false)
        return
      }

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
    Alert.alert(t('profile.logout'), t('profile.signout_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logout'),
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
        <Text style={styles.guestTitle}>{t('profile.not_signed_in')}</Text>
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

  const genderLocked = !!profile?.gender

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Avatar & name */}
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.displayName}>{profile?.display_name ?? t('profile.title')}</Text>
          <Text style={styles.email}>{user.email}</Text>
          {profile?.city && <Text style={styles.city}>📍 {profile.city}</Text>}
          {profile?.gender && (
            <Text style={styles.city}>{profile.gender === 'male' ? `👨 ${t('profile.male')}` : `👩 ${t('profile.female')}`}</Text>
          )}
          {profile?.role === 'organizer' && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{t('profile.organizer_badge')}</Text>
            </View>
          )}
          {profile?.role === 'admin' && (
            <View style={[styles.roleBadge, { backgroundColor: Colors.red.light }]}>
              <Text style={[styles.roleBadgeText, { color: Colors.red.text }]}>{t('profile.admin_badge')}</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.editToggle}
            onPress={() => { setEditing((v) => !v); setSaveMsg(null) }}
          >
            <Text style={styles.editToggleText}>{editing ? t('profile.cancel') : t('profile.edit')}</Text>
          </TouchableOpacity>
        </View>

        {/* Edit form */}
        {editing && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.edit_title')}</Text>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{t('profile.display_name')}</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor={Colors.gray[400]}
                maxLength={80}
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{t('profile.city')}</Text>
              <View style={styles.chipRow}>
                {CITIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, city === c && styles.chipActive]}
                    onPress={() => setCity(city === c ? '' : c)}
                  >
                    <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>
                {genderLocked ? t('profile.gender_locked') : t('profile.gender')}
              </Text>
              {genderLocked ? (
                <View style={styles.lockedRow}>
                  <Text style={styles.lockedText}>
                    {gender === 'male' ? t('profile.male') : t('profile.female')}
                  </Text>
                  <Text style={styles.lockedNote}>{t('profile.gender_locked_note')}</Text>
                </View>
              ) : (
                <View style={styles.chipRow}>
                  {GENDER_OPTIONS.map((g) => (
                    <TouchableOpacity
                      key={g.value}
                      style={[styles.chip, gender === g.value && styles.chipActive]}
                      onPress={() => setGender(gender === g.value ? '' : g.value)}
                    >
                      <Text style={[styles.chipText, gender === g.value && styles.chipTextActive]}>
                        {g.value === 'male' ? t('profile.male') : t('profile.female')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{t('profile.bio')}</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell others about yourself…"
                placeholderTextColor={Colors.gray[400]}
                multiline
                numberOfLines={3}
                maxLength={500}
              />
              <Text style={styles.charCount}>{bio.length}/500</Text>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="+966 5x xxx xxxx"
                placeholderTextColor={Colors.gray[400]}
                keyboardType="phone-pad"
                maxLength={20}
              />
            </View>

            {saveMsg && (
              <View style={[styles.msgBox, saveMsg.ok ? styles.msgOk : styles.msgErr]}>
                <Text style={saveMsg.ok ? styles.msgOkText : styles.msgErrText}>{saveMsg.text}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, (!displayName || saving) && styles.saveBtnDisabled]}
              onPress={saveProfile}
              disabled={!displayName || saving}
            >
              {saving
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.saveBtnText}>{t('profile.save')}</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Email Change */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Security</Text>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Change Email</Text>
            <Text style={[styles.fieldLabel, { textTransform: 'none', letterSpacing: 0, color: Colors.gray[500], marginTop: 0 }]}>
              Current: {user.email}
            </Text>
            <TextInput
              style={[styles.input, { marginTop: Spacing.xs }]}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="new@example.com"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {emailMsg && (
              <View style={[styles.msgBox, emailMsg.ok ? styles.msgOk : styles.msgErr, { marginHorizontal: 0, marginTop: Spacing.sm }]}>
                <Text style={emailMsg.ok ? styles.msgOkText : styles.msgErrText}>{emailMsg.text}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.saveBtn, { marginHorizontal: 0, marginTop: Spacing.md }, (!newEmail || newEmail === user.email || emailChanging) && styles.saveBtnDisabled]}
              onPress={handleEmailChange}
              disabled={!newEmail || newEmail === user.email || emailChanging}
            >
              {emailChanging
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.saveBtnText}>Send Confirmation</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* My Plan */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <TouchableOpacity style={styles.row} onPress={() => router.push('/plans')}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>💎</Text>
              <View>
                <Text style={styles.rowLabel}>My Plan</Text>
                <Text style={[styles.rowValue, { fontSize: 11 }]}>
                  {{
                    user_free: 'Free',
                    user_premium: 'Premium',
                    org_basic: 'Basic',
                    org_pro: 'Pro',
                    org_elite: 'Elite',
                  }[(profile as Record<string, unknown>)?.plan_id as string] ?? 'Free'}
                </Text>
              </View>
            </View>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.settings')}</Text>

          {/* Language */}
          <TouchableOpacity style={styles.row} onPress={toggleLocale}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🌐</Text>
              <Text style={styles.rowLabel}>{t('profile.language')}</Text>
            </View>
            <Text style={styles.rowValue}>{locale === 'en' ? 'English' : 'العربية'}</Text>
          </TouchableOpacity>

          {/* Push notifications */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🔔</Text>
              <Text style={styles.rowLabel}>{t('profile.push_notifications')}</Text>
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

        {/* Organizer links */}
        {profile?.role === 'organizer' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.organizer_section')}</Text>
            <TouchableOpacity style={styles.row} onPress={() => router.push('/organizer/dashboard')}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowIcon}>📊</Text>
                <Text style={styles.rowLabel}>{t('profile.my_dashboard')}</Text>
              </View>
              <Text style={styles.rowArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={() => router.push('/organizer/earnings')}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowIcon}>💰</Text>
                <Text style={styles.rowLabel}>Earnings & Wallet</Text>
              </View>
              <Text style={styles.rowArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={() => router.push('/organizer/event-form')}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowIcon}>➕</Text>
                <Text style={styles.rowLabel}>{t('profile.create_event')}</Text>
              </View>
              <Text style={styles.rowArrow}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Admin links */}
        {profile?.role === 'admin' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.admin_section')}</Text>
            <TouchableOpacity style={styles.row} onPress={() => router.push('/admin/dashboard')}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowIcon}>🛡️</Text>
                <Text style={styles.rowLabel}>{t('profile.admin_dashboard')}</Text>
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

        <Text style={styles.version}>{t('profile.version')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
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
  editToggle: { marginTop: Spacing.md },
  editToggleText: { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium },
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
  // Edit form
  fieldWrap: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.gray[50] },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  input: { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: FontSize.base, color: Colors.gray[900] },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  charCount: { fontSize: FontSize.xs, color: Colors.gray[400], textAlign: 'right', marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.gray[200], marginBottom: Spacing.xs },
  chipActive: { borderColor: Colors.brand[500], backgroundColor: Colors.brand[50] },
  chipText: { fontSize: FontSize.sm, color: Colors.gray[600] },
  chipTextActive: { color: Colors.brand[600], fontWeight: FontWeight.semibold },
  lockedRow: { paddingVertical: Spacing.xs },
  lockedText: { fontSize: FontSize.base, color: Colors.gray[700], fontWeight: FontWeight.medium, textTransform: 'capitalize' },
  lockedNote: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },
  saveBtn: { margin: Spacing.lg, marginTop: Spacing.sm, backgroundColor: Colors.brand[500], borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: Colors.gray[300] },
  saveBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  msgBox: { marginHorizontal: Spacing.lg, borderRadius: Radius.md, padding: Spacing.md },
  msgOk: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  msgErr: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  msgOkText: { fontSize: FontSize.sm, color: '#15803d' },
  msgErrText: { fontSize: FontSize.sm, color: '#b91c1c' },
})
