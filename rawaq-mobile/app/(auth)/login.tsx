import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Image,
} from 'react-native'
import { Link } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from '@/lib/supabase'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'

WebBrowser.maybeCompleteAuthSession()

export default function LoginScreen() {
  const { t, isRTL } = useLocale()
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [error, setError]           = useState<string | null>(null)

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
          // OAuth provider returned an error
          setError(qp.get('error_description') ?? oauthError)
        } else if (code) {
          // PKCE flow — exchange code for session
          const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
          if (sessionError) setError(sessionError.message)
        } else if (accessToken && refreshToken) {
          // Implicit flow fallback
          const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          if (sessionError) setError(sessionError.message)
        }
        // No code/tokens and no error = Android handled it via auth/callback.tsx deep link
      }
    }
    setOauthLoading(false)
  }

  async function handleLogin() {
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Rawaq</Text>
          <Text style={styles.subtitle}>{t('auth.login')}</Text>
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

          <View style={styles.field}>
            <Text style={[styles.label, isRTL && styles.rtlText]}>{t('auth.email')}</Text>
            <TextInput
              style={[styles.input, isRTL && styles.rtlInput]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textAlign={isRTL ? 'right' : 'left'}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, isRTL && styles.rtlText]}>{t('auth.password')}</Text>
            <TextInput
              style={[styles.input, isRTL && styles.rtlInput]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={Colors.gray[400]}
              secureTextEntry
              autoComplete="password"
              textAlign={isRTL ? 'right' : 'left'}
            />
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, (loading || oauthLoading) && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading || oauthLoading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.btnText}>{t('auth.login')}</Text>
            }
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.no_account')} </Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity>
                <Text style={styles.link}>{t('auth.register')}</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.brand[50] },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl },
  header: { alignItems: 'center', marginBottom: Spacing['3xl'] },
  logo: { width: 64, height: 64, marginBottom: Spacing.sm },
  title: { fontSize: 28, fontWeight: FontWeight.bold, color: Colors.brand[600], marginBottom: Spacing.xs },
  subtitle: { fontSize: FontSize.base, color: Colors.gray[500] },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing['2xl'],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.lg, paddingVertical: Spacing.md, marginBottom: Spacing.sm },
  googleIcon: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#4285F4' },
  googleBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.medium, color: Colors.gray[700] },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.gray[200] },
  dividerText: { fontSize: FontSize.xs, color: Colors.gray[400], textTransform: 'uppercase', letterSpacing: 1 },
  field: { marginBottom: Spacing.lg },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.gray[700], marginBottom: 6 },
  rtlText: { textAlign: 'right' },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.gray[900],
    backgroundColor: Colors.white,
  },
  rtlInput: { textAlign: 'right' },
  errorBox: {
    backgroundColor: Colors.red.light,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { color: Colors.red.text, fontSize: FontSize.sm },
  btn: {
    backgroundColor: Colors.brand[500],
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xl },
  footerText: { color: Colors.gray[500], fontSize: FontSize.sm },
  link: { color: Colors.brand[600], fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
})
