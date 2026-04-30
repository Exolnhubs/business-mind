import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Switch, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, Image,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Device from 'expo-device'
import * as ImagePicker from 'expo-image-picker'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'
import { uploadViaApi } from '@/lib/upload'

// Android push notifications were removed from Expo Go with SDK 53.
// The DevicePushTokenAutoRegistration.fx.js effect in expo-notifications
// crashes on Android Expo Go at module load time — so we conditionally
// require the module only on Android Expo Go. iOS Expo Go is unaffected
// and can still register for push notifications normally.
const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient'
const IS_ANDROID_EXPO_GO = IS_EXPO_GO && Platform.OS === 'android'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications = IS_ANDROID_EXPO_GO ? null : (require('expo-notifications') as typeof import('expo-notifications'))
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import { apiGet, apiPost } from '@/lib/api'
import * as Location from 'expo-location'
import type { DeviceToken, Profile } from '@/types/database'
import { PlanBadge } from '@/components/ui/PlanBadge'

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  })
}

const GENDER_OPTIONS: { label: string; value: 'male' | 'female' }[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
]

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const { t, locale, toggleLocale } = useLocale()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [smartPicksEnabled, setSmartPicksEnabled] = useState(true)
  const [smartPicksLoading, setSmartPicksLoading] = useState(false)
  const [signingOut, setSigningOut]   = useState(false)

  // Edit form
  const [editing, setEditing]         = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio]                 = useState('')
  const [phone, setPhone]             = useState('')
  const [gender, setGender]           = useState<'male' | 'female' | ''>('')
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState<{ ok: boolean; text: string } | null>(null)

  // Location detection
  const [locating, setLocating]       = useState(false)
  const [locMsg, setLocMsg]           = useState<{ ok: boolean; text: string } | null>(null)

  const [avatarUploading, setAvatarUploading] = useState(false)

  // Email change form
  const [newEmail, setNewEmail]       = useState('')
  const [emailChanging, setEmailChanging] = useState(false)
  const [emailMsg, setEmailMsg]       = useState<{ ok: boolean; text: string } | null>(null)

  // Organizer request
  const [orgRequest, setOrgRequest]         = useState<{ id: string; status: string; business_name: string } | null | undefined>(undefined) // undefined = loading
  const [showOrgForm, setShowOrgForm]       = useState(false)
  const [businessName, setBusinessName]     = useState('')
  const [orgDesc, setOrgDesc]               = useState('')
  const [orgSubmitting, setOrgSubmitting]   = useState(false)
  const [orgMsg, setOrgMsg]                 = useState<{ ok: boolean; text: string } | null>(null)

  // Populate form from profile
  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name ?? '')
    setBio(profile.bio ?? '')
    setGender(profile.gender === 'male' || profile.gender === 'female' ? profile.gender : '')
    setPhone(profile.phone ?? '')
    const preferences = (profile.preferences as Record<string, unknown> | null) ?? null
    setSmartPicksEnabled(
      typeof preferences?.show_smart_picks_trigger === 'boolean'
        ? Boolean(preferences.show_smart_picks_trigger)
        : true,
    )
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

  useEffect(() => {
    if (!profile || profile.role !== 'user') return
    apiGet<{ id: string; status: string; business_name: string }>('/api/organizer/request').then(({ data }) => setOrgRequest(data))
  }, [profile])

  async function pickAndUploadAvatar() {
    if (!user) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return

    setAvatarUploading(true)
    try {
      const publicUrl = await uploadViaApi(result.assets[0].uri, 'avatar')

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)

      if (updateError) { Alert.alert(t('profile.save_failed'), updateError.message); return }
      await refreshProfile()
    } catch (e: unknown) {
      Alert.alert(t('profile.upload_failed'), e instanceof Error ? e.message : t('profile.try_again'))
    } finally {
      setAvatarUploading(false)
    }
  }

  async function saveProfile() {
    if (!user) return
    setSaving(true)
    setSaveMsg(null)

    const body: Partial<Pick<Profile, 'display_name' | 'bio' | 'phone' | 'gender'>> = {
      display_name: displayName.trim(),
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
      setEmailMsg({ ok: true, text: t('profile.email_confirmation_sent').replace('{email}', trimmed) })
      setNewEmail('')
    }
    setEmailChanging(false)
  }

  async function togglePush(enabled: boolean) {
    if (!user) return
    setPushLoading(true)

    if (enabled) {
      const notifications = Notifications
      if (IS_ANDROID_EXPO_GO) {
        Alert.alert(t('profile.not_supported'), t('profile.android_push_requires_build'))
        setPushLoading(false)
        return
      }
      if (!notifications) {
        Alert.alert(t('profile.push_unavailable'), t('profile.notifications_unavailable_env'))
        setPushLoading(false)
        return
      }

      if (!Device.isDevice) {
        Alert.alert(t('profile.push_requires_device'))
        setPushLoading(false)
        return
      }

      const { status: existingStatus } = await notifications.getPermissionsAsync()
      let finalStatus = existingStatus
      if (existingStatus !== 'granted') {
        const { status } = await notifications.requestPermissionsAsync()
        finalStatus = status
      }
      if (finalStatus !== 'granted') {
        Alert.alert(t('profile.notifications_blocked'), t('profile.enable_notifications_settings'))
        setPushLoading(false)
        return
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        (Constants as Record<string, Record<string, Record<string, string>>>).easConfig?.projectId

      let token: Awaited<ReturnType<typeof notifications.getExpoPushTokenAsync>>
      try {
        token = await notifications.getExpoPushTokenAsync(projectId ? { projectId } : {})
      } catch {
        Alert.alert(t('profile.push_unavailable'), t('profile.device_registration_failed'))
        setPushLoading(false)
        return
      }

      const deviceTokenPayload: Pick<DeviceToken, 'user_id' | 'token' | 'platform' | 'is_active'> = {
        user_id: user.id,
        token: token.data,
        platform: Platform.OS as 'ios' | 'android',
        is_active: true,
      }

      await supabase.from('device_tokens').upsert(deviceTokenPayload, { onConflict: 'user_id,token' })

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

  async function toggleSmartPicksTrigger(enabled: boolean) {
    if (!user || !profile) return
    setSmartPicksLoading(true)
    setSmartPicksEnabled(enabled)

    const preferences = (profile.preferences as Record<string, unknown> | null) ?? {}
    const { error } = await supabase
      .from('profiles')
      .update({
        preferences: {
          ...preferences,
          show_smart_picks_trigger: enabled,
        },
      })
      .eq('id', user.id)

    if (error) {
      setSmartPicksEnabled(
        typeof preferences.show_smart_picks_trigger === 'boolean'
          ? Boolean(preferences.show_smart_picks_trigger)
          : true,
      )
      Alert.alert(t('profile.setting_update_failed'), error.message)
    } else {
      await refreshProfile()
    }

    setSmartPicksLoading(false)
  }

  async function detectLocation() {
    if (!user) return
    setLocating(true)
    setLocMsg(null)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setLocMsg({ ok: false, text: t('profile.location_permission_denied') })
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const [geo] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
      const city = geo?.city ?? geo?.subregion ?? geo?.region ?? null

      const locationUpdate: Partial<Pick<Profile, 'city' | 'lat' | 'lng' | 'signup_lat' | 'signup_lng'>> = {
        city,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        signup_lat: pos.coords.latitude,
        signup_lng: pos.coords.longitude,
      }

      const { error } = await supabase
        .from('profiles')
        .update(locationUpdate)
        .eq('id', user.id)

      if (error) {
        setLocMsg({ ok: false, text: error.message })
      } else {
        await refreshProfile()
        setLocMsg({ ok: true, text: t('profile.location_set').replace('{city}', city ?? t('profile.your_area')) })
      }
    } catch (e: unknown) {
      setLocMsg({ ok: false, text: e instanceof Error ? e.message : t('profile.location_detect_failed') })
    } finally {
      setLocating(false)
    }
  }

  async function submitOrgRequest() {
    if (!businessName.trim()) return
    setOrgSubmitting(true)
    setOrgMsg(null)
    const { data, error } = await apiPost<{ id: string; status: string; business_name: string }>('/api/organizer/request', {
      business_name: businessName.trim(),
      description:   orgDesc.trim() || null,
    })
    if (error) {
      setOrgMsg({ ok: false, text: error })
    } else {
      setOrgRequest(data)
      setShowOrgForm(false)
      setOrgMsg({ ok: true, text: t('profile.org_request_submitted') })
    }
    setOrgSubmitting(false)
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
      <View style={[styles.centered, { paddingTop: insets.top + Spacing['3xl'] }]}>
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
  const planName = {
    user_free: t('profile.plan_free'),
    user_premium: t('profile.plan_premium'),
    org_basic: t('profile.plan_basic'),
    org_pro: t('profile.plan_pro'),
    org_elite: t('profile.plan_elite'),
  }[profile?.plan_id ?? ''] ?? t('profile.plan_free')

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Avatar & name */}
        <View style={[styles.hero, { paddingTop: insets.top + Spacing['3xl'] }]}>
          <TouchableOpacity onPress={pickAndUploadAvatar} disabled={avatarUploading} style={styles.avatarWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            {avatarUploading
              ? <ActivityIndicator style={styles.avatarOverlay} color={Colors.white} />
              : <Text style={styles.avatarEditHint}>📷</Text>
            }
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.displayName}>{profile?.display_name ?? t('profile.title')}</Text>
            <PlanBadge planId={profile?.plan_id} size={18} />
          </View>
          <Text style={styles.email}>{user.email}</Text>
          <TouchableOpacity onPress={detectLocation} disabled={locating} style={styles.cityRow}>
            {locating
              ? <ActivityIndicator size="small" color={Colors.brand[500]} />
              : <Text style={styles.cityPinText}>📍</Text>
            }
            <Text style={[styles.city, { marginTop: 0, marginLeft: 4 }]}>
              {locating ? t('profile.detecting') : (profile?.city ?? t('profile.tap_to_set_location'))}
            </Text>
          </TouchableOpacity>
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
                placeholder={t('profile.your_name_placeholder')}
                placeholderTextColor={Colors.gray[400]}
                maxLength={80}
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{t('profile.city')}</Text>
              {profile?.city ? (
                <View style={styles.lockedRow}>
                  <Text style={styles.lockedText}>📍 {profile.city}</Text>
                  <Text style={styles.lockedNote}>{t('profile.detected_from_location')}</Text>
                </View>
              ) : (
                <View style={{ gap: Spacing.xs }}>
                  <Text style={[styles.lockedNote, { marginBottom: Spacing.xs }]}>
                    {t('profile.city_location_note')}
                  </Text>
                  <TouchableOpacity
                    style={[styles.chip, { paddingHorizontal: Spacing.lg, alignSelf: 'flex-start' }]}
                    onPress={detectLocation}
                    disabled={locating}
                  >
                    {locating
                      ? <ActivityIndicator size="small" color={Colors.brand[600]} />
                      : <Text style={styles.chipText}>📍 {locating ? t('profile.detecting') : t('profile.detect_my_location')}</Text>
                    }
                  </TouchableOpacity>
                  {locMsg && (
                    <Text style={{ fontSize: FontSize.xs, color: locMsg.ok ? '#15803d' : '#b91c1c', marginTop: 2 }}>
                      {locMsg.text}
                    </Text>
                  )}
                </View>
              )}
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
                placeholder={t('profile.bio_placeholder')}
                placeholderTextColor={Colors.gray[400]}
                multiline
                numberOfLines={3}
                maxLength={500}
              />
              <Text style={styles.charCount}>{bio.length}/500</Text>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{t('profile.phone_number')}</Text>
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
          <Text style={styles.sectionTitle}>{t('profile.account_security')}</Text>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>{t('profile.change_email')}</Text>
            <Text style={[styles.fieldLabel, { textTransform: 'none', letterSpacing: 0, color: Colors.gray[500], marginTop: 0 }]}>
              {t('profile.current_email').replace('{email}', user.email ?? '')}
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
                : <Text style={styles.saveBtnText}>{t('profile.send_confirmation')}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* My Plan */}
        {/* Refer & Earn */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.rewards')}</Text>
          <TouchableOpacity style={styles.row} onPress={() => router.push('/referral' as never)}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🎁</Text>
              <View>
                <Text style={styles.rowLabel}>{t('profile.refer_earn')}</Text>
                <Text style={[styles.rowValue, { fontSize: 11 }]}>{t('profile.refer_earn_sub')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.subscription')}</Text>
          <TouchableOpacity style={styles.row} onPress={() => router.push('/plans')}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>💎</Text>
              <View>
                <Text style={styles.rowLabel}>{t('profile.my_plan')}</Text>
                <Text style={[styles.rowValue, { fontSize: 11 }]}>
                  {planName}
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

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>✨</Text>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowLabel}>{t('profile.smart_picks_toggle')}</Text>
                <Text style={[styles.rowValue, { fontSize: 11 , textAlign: 'left' }]}>{t('profile.smart_picks_toggle_sub')}</Text>
              </View>
            </View>
            {smartPicksLoading
              ? <ActivityIndicator size="small" color={Colors.brand[500]} />
              : <Switch
                value={smartPicksEnabled}
                onValueChange={toggleSmartPicksTrigger}
                trackColor={{ false: Colors.gray[200], true: Colors.brand[400] }}
                thumbColor={smartPicksEnabled ? Colors.brand[500] : Colors.gray[400]}
              />
            }
          </View>

          {/* Contact Support */}
          <TouchableOpacity style={styles.row} onPress={() => router.push('/support')}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🎧</Text>
              <View>
                <Text style={styles.rowLabel}>{t('profile.contact_support')}</Text>
                <Text style={[styles.rowValue, { fontSize: 11 }]}>{t('profile.contact_support_sub')}</Text>
              </View>
            </View>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Become an Organizer */}
        {profile?.role === 'user' && orgRequest !== undefined && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.organizer_section')}</Text>

            {orgRequest?.status === 'pending' ? (
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowIcon}>⏳</Text>
                  <View>
                    <Text style={styles.rowLabel}>{t('profile.application_pending')}</Text>
                    <Text style={[styles.rowValue, { fontSize: 11 }]}>
                      {t('profile.application_pending_sub')}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { setShowOrgForm((v) => !v); setOrgMsg(null) }}
                >
                  <View style={styles.rowLeft}>
                    <Text style={styles.rowIcon}>🏢</Text>
                    <View>
                      <Text style={styles.rowLabel}>{t('profile.become_organizer')}</Text>
                      <Text style={[styles.rowValue, { fontSize: 11 }]}>
                        {orgRequest?.status === 'rejected' ? t('profile.reapply_organizer') : t('profile.host_manage_events')}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.rowArrow}>{showOrgForm ? '∨' : '›'}</Text>
                </TouchableOpacity>

                {showOrgForm && (
                  <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md }}>
                    <View style={styles.fieldWrap}>
                      <Text style={styles.fieldLabel}>{t('profile.business_name')}</Text>
                      <TextInput
                        style={styles.input}
                        value={businessName}
                        onChangeText={setBusinessName}
                        placeholder={t('profile.business_name_placeholder')}
                        placeholderTextColor={Colors.gray[400]}
                        maxLength={120}
                      />
                    </View>
                    <View style={styles.fieldWrap}>
                      <Text style={styles.fieldLabel}>{t('profile.org_about')}</Text>
                      <TextInput
                        style={[styles.input, styles.inputMulti]}
                        value={orgDesc}
                        onChangeText={setOrgDesc}
                        placeholder={t('profile.org_about_placeholder')}
                        placeholderTextColor={Colors.gray[400]}
                        multiline
                        numberOfLines={3}
                        maxLength={500}
                      />
                    </View>
                    {orgMsg && (
                      <View style={[styles.msgBox, orgMsg.ok ? styles.msgOk : styles.msgErr, { marginHorizontal: 0, marginTop: 0 }]}>
                        <Text style={orgMsg.ok ? styles.msgOkText : styles.msgErrText}>{orgMsg.text}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={[styles.saveBtn, { marginHorizontal: 0, marginTop: Spacing.md }, (!businessName.trim() || orgSubmitting) && styles.saveBtnDisabled]}
                      onPress={submitOrgRequest}
                      disabled={!businessName.trim() || orgSubmitting}
                    >
                      {orgSubmitting
                        ? <ActivityIndicator color={Colors.white} />
                        : <Text style={styles.saveBtnText}>{t('profile.submit_request')}</Text>
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {orgMsg && orgRequest?.status === 'pending' && (
              <View style={[styles.msgBox, styles.msgOk]}>
                <Text style={styles.msgOkText}>{orgMsg.text}</Text>
              </View>
            )}
          </View>
        )}

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
                <Text style={styles.rowLabel}>{t('profile.earnings_wallet')}</Text>
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
  avatarWrap: { position: 'relative', marginBottom: Spacing.md, alignSelf: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarText: { fontSize: 28, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  avatarOverlay: { position: 'absolute', bottom: 0, right: 0 },
  avatarEditHint: { position: 'absolute', bottom: 0, right: -2, fontSize: 16, backgroundColor: Colors.white, borderRadius: 10, overflow: 'hidden', padding: 1 },
  displayName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  email: { fontSize: FontSize.sm, color: Colors.gray[500], marginTop: 4 },
  city: { fontSize: FontSize.sm, color: Colors.gray[500], marginTop: 4 },
  cityRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  cityPinText: { fontSize: FontSize.sm },
  roleBadge: { marginTop: Spacing.sm, backgroundColor: Colors.brand[50], borderRadius: Radius.full, paddingHorizontal: Spacing.lg, paddingVertical: 4 },
  roleBadgeText: { fontSize: FontSize.sm, color: Colors.brand[700], fontWeight: FontWeight.semibold },
  editToggle: { marginTop: Spacing.md },
  editToggleText: { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium },
  section: { margin: Spacing.lg, backgroundColor: Colors.white, borderRadius: Radius.lg, overflow: 'hidden', ...Shadow.card },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.gray[50] },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1, minWidth: 0, paddingRight: Spacing.md },
  rowTextWrap: { flex: 1, minWidth: 0, gap: Spacing.xs, alignItems: 'flex-start' },
  rowIcon: { fontSize: 20 },
  rowLabel: { fontSize: FontSize.base, color: Colors.gray[800], flexShrink: 1 },
  rowValue: { fontSize: FontSize.sm, color: Colors.gray[500], flexShrink: 1,  },
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
