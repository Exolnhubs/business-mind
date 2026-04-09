import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Image,
} from 'react-native'
import { Link } from 'expo-router'
import * as Location from 'expo-location'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from '@/lib/supabase'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'

WebBrowser.maybeCompleteAuthSession()

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk', 'Abha']

type LocationState =
  | { status: 'idle' }
  | { status: 'detecting' }
  | { status: 'detected'; city: string; lat: number; lng: number }
  | { status: 'denied' }

export default function RegisterScreen() {
  const { t, isRTL } = useLocale()
  const [form, setForm] = useState({
    email: '', password: '', name: '', businessName: '', city: '',
    lat: null as number | null,
    lng: null as number | null,
    role: 'user' as 'user' | 'organizer',
  })
  const [locationState, setLocationState] = useState<LocationState>({ status: 'idle' })
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [done, setDone]           = useState(false)

  function set(k: keyof typeof form) {
    return (v: string) => setForm((f) => ({ ...f, [k]: v }))
  }

  // Auto-detect location on mount
  useEffect(() => {
    ;(async () => {
      setLocationState({ status: 'detecting' })
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setLocationState({ status: 'denied' })
        return
      }
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const { latitude: lat, longitude: lng } = pos.coords
        const [geocode] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
        const city = geocode?.city ?? geocode?.subregion ?? geocode?.region ?? ''
        setLocationState({ status: 'detected', city, lat, lng })
        setForm((f) => ({ ...f, city, lat, lng }))
      } catch {
        setLocationState({ status: 'denied' })
      }
    })()
  }, [])

  async function handleGoogleSignIn() {
    setOauthLoading(true)
    setError(null)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'rawaq://auth/callback', skipBrowserRedirect: true },
    })
    if (error) {
      setError(error.message)
      setOauthLoading(false)
      return
    }
    if (data.url) {
      const result = await WebBrowser.openAuthSessionAsync(data.url, 'rawaq://auth/callback')
      if (result.type === 'success' && result.url) {
        const queryString = result.url.split('?')[1]?.split('#')[0] ?? ''
        const hashString  = result.url.split('#')[1] ?? ''
        const qp          = new URLSearchParams(queryString)
        const hp          = new URLSearchParams(hashString)

        const code         = qp.get('code')
        const oauthError   = qp.get('error')
        const accessToken  = hp.get('access_token')
        const refreshToken = hp.get('refresh_token')

        if (oauthError) {
          setError(qp.get('error_description') ?? oauthError)
        } else if (code) {
          const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
          if (sessionError) setError(sessionError.message)
        } else if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          if (sessionError) setError(sessionError.message)
        }
      }
    }
    setOauthLoading(false)
  }

  async function handleRegister() {
    setError(null)
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          display_name: form.name,
          city: form.city,
          role: form.role,
          signup_lat: form.lat,
          signup_lng: form.lng,
          ...(form.role === 'organizer' && form.businessName
            ? { business_name: form.businessName }
            : {}),
        },
      },
    })
    if (error) { setError(error.message); setLoading(false); return }
    if (!data.session) setDone(true)
    setLoading(false)
  }

  if (done) {
    return (
      <View style={styles.doneContainer}>
        <Text style={{ fontSize: 52 }}>✉️</Text>
        <Text style={styles.doneTitle}>{t('auth.check_email')}</Text>
        <Text style={styles.doneSub}>{t('auth.check_email_sub')}</Text>
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={[styles.btn, { marginTop: Spacing['3xl'] }]}>
            <Text style={styles.btnText}>{t('auth.back_to_signin')}</Text>
          </TouchableOpacity>
        </Link>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: Colors.brand[50] }}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>{t('auth.join')}</Text>
        </View>

        <View style={styles.card}>
          {/* Google Sign-In */}
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleSignIn}
            disabled={oauthLoading || loading}
            activeOpacity={0.8}
          >
            {oauthLoading ? (
              <ActivityIndicator color={Colors.gray[600]} />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {[
            { key: 'name',     label: t('auth.name'),     type: 'default',       secure: false },
            { key: 'email',    label: t('auth.email'),    type: 'email-address', secure: false },
            { key: 'password', label: t('auth.password'), type: 'default',       secure: true  },
          ].map(({ key, label, type, secure }) => (
            <View key={key} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                value={form[key as keyof typeof form] as string}
                onChangeText={set(key as keyof typeof form)}
                keyboardType={type as 'default' | 'email-address'}
                autoCapitalize={key === 'email' ? 'none' : 'words'}
                secureTextEntry={secure}
                placeholderTextColor={Colors.gray[400]}
                textAlign={isRTL ? 'right' : 'left'}
              />
            </View>
          ))}

          {/* Location auto-detect */}
          <View style={styles.field}>
            <Text style={styles.label}>Location</Text>
            {locationState.status === 'detecting' && (
              <View style={styles.locationDetecting}>
                <ActivityIndicator size="small" color={Colors.brand[500]} />
                <Text style={styles.locationDetectingText}>Detecting your location…</Text>
              </View>
            )}
            {locationState.status === 'detected' && (
              <View style={styles.locationDetected}>
                <Text style={styles.locationDetectedText}>
                  📍 {locationState.city || 'Location detected'} ✓
                </Text>
              </View>
            )}
            {locationState.status === 'denied' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
                {CITIES.map((city) => (
                  <TouchableOpacity
                    key={city}
                    onPress={() => set('city')(city)}
                    style={[styles.pill, form.city === city && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, form.city === city && styles.pillTextActive]}>
                      {city}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Role */}
          <View style={styles.field}>
            <Text style={styles.label}>{t('auth.i_am_a')}</Text>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              {(['user', 'organizer'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => set('role')(r)}
                  style={[styles.roleBtn, form.role === r && styles.roleBtnActive]}
                >
                  <Text style={{ fontSize: 18 }}>{r === 'user' ? '👤' : '🏢'}</Text>
                  <Text style={[styles.roleBtnText, form.role === r && styles.roleBtnTextActive]}>
                    {t(`auth.role_${r === 'user' ? 'user' : 'org'}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Business name — only for organizers */}
          {form.role === 'organizer' && (
            <View style={styles.field}>
              <Text style={styles.label}>Business / Brand Name</Text>
              <TextInput
                style={styles.input}
                value={form.businessName}
                onChangeText={set('businessName')}
                placeholder="My Events Co."
                placeholderTextColor={Colors.gray[400]}
                textAlign={isRTL ? 'right' : 'left'}
              />
              <Text style={{ fontSize: 11, color: Colors.gray[400], marginTop: 4 }}>
                Your account will need admin approval before you can start creating events.
              </Text>
            </View>
          )}

          {/* Terms */}
          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setTermsAccepted((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>{t('auth.terms_agree')}</Text>
          </TouchableOpacity>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity style={[styles.btn, (loading || !termsAccepted) && styles.btnDisabled]} onPress={handleRegister} disabled={loading || !termsAccepted} activeOpacity={0.8}>
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.btnText}>{t('auth.register')}</Text>
            }
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.has_account')} </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity><Text style={styles.link}>{t('auth.login')}</Text></TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: Spacing.xl },
  header: { alignItems: 'center', marginBottom: Spacing['3xl'], marginTop: Spacing['3xl'] },
  logo: { width: 64, height: 64 },
  title: { fontSize: 26, fontWeight: FontWeight.bold, color: Colors.brand[600], marginTop: Spacing.sm },
  card: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing['2xl'], shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, marginBottom: Spacing['3xl'] },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.lg, paddingVertical: Spacing.md, marginBottom: Spacing.sm },
  googleIcon: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#4285F4' },
  googleBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.medium, color: Colors.gray[700] },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.gray[200] },
  dividerText: { fontSize: FontSize.xs, color: Colors.gray[400], textTransform: 'uppercase', letterSpacing: 1 },
  field: { marginBottom: Spacing.lg },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.gray[700], marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, fontSize: FontSize.base, color: Colors.gray[900] },
  locationDetecting: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.gray[50], borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  locationDetectingText: { fontSize: FontSize.sm, color: Colors.gray[500] },
  locationDetected: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  locationDetectedText: { fontSize: FontSize.sm, color: '#15803d', fontWeight: FontWeight.medium },
  pillRow: { marginTop: Spacing.xs },
  pill: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.gray[200], marginRight: Spacing.sm, backgroundColor: Colors.white },
  pillActive: { borderColor: Colors.brand[400], backgroundColor: Colors.brand[50] },
  pillText: { fontSize: FontSize.sm, color: Colors.gray[600] },
  pillTextActive: { color: Colors.brand[700], fontWeight: FontWeight.medium },
  roleBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.gray[200], gap: 4 },
  roleBtnActive: { borderColor: Colors.brand[400], backgroundColor: Colors.brand[50] },
  roleBtnText: { fontSize: FontSize.sm, color: Colors.gray[600] },
  roleBtnTextActive: { color: Colors.brand[700], fontWeight: FontWeight.semibold },
  errorBox: { backgroundColor: Colors.red.light, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  errorText: { color: Colors.red.text, fontSize: FontSize.sm },
  btn: { backgroundColor: Colors.brand[500], borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xl },
  footerText: { color: Colors.gray[500], fontSize: FontSize.sm },
  link: { color: Colors.brand[600], fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.lg },
  checkbox: { width: 18, height: 18, borderWidth: 1.5, borderColor: Colors.gray[300], borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { borderColor: Colors.brand[500], backgroundColor: Colors.brand[500] },
  checkmark: { color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold },
  termsText: { flex: 1, fontSize: FontSize.xs, color: Colors.gray[500], lineHeight: 18 },
  doneContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['3xl'], backgroundColor: Colors.brand[50] },
  doneTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, marginTop: Spacing.lg, color: Colors.gray[900] },
  doneSub: { fontSize: FontSize.base, color: Colors.gray[500], textAlign: 'center', marginTop: Spacing.sm },
})
