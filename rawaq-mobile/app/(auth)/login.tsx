import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native'
import { Link } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'

export default function LoginScreen() {
  const { t, isRTL } = useLocale()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

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
          <Text style={styles.logo}>🪄</Text>
          <Text style={styles.title}>Rawaq</Text>
          <Text style={styles.subtitle}>{t('auth.login')}</Text>
        </View>

        <View style={styles.card}>
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
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
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
  logo: { fontSize: 52, marginBottom: Spacing.sm },
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
