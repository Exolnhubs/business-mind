import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Linking,
} from 'react-native'
import { Link } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk', 'Abha']

export default function RegisterScreen() {
  const { t, isRTL } = useLocale()
  const [form, setForm] = useState({
    email: '', password: '', name: '', city: '', role: 'user' as 'user' | 'organizer',
  })
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [done, setDone]       = useState(false)

  function set(k: keyof typeof form) {
    return (v: string) => setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleRegister() {
    setError(null)
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { display_name: form.name, city: form.city, role: form.role } },
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
          <Text style={styles.logo}>🪄</Text>
          <Text style={styles.title}>{t('auth.join')}</Text>
        </View>

        <View style={styles.card}>
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

          {/* City selector (simplified) */}
          <View style={styles.field}>
            <Text style={styles.label}>{t('auth.city')}</Text>
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

          {/* Terms & Conditions */}
          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setTermsAccepted((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              {t('auth.terms_agree')}
            </Text>
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
  logo: { fontSize: 52 },
  title: { fontSize: 26, fontWeight: FontWeight.bold, color: Colors.brand[600], marginTop: Spacing.sm },
  card: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing['2xl'], shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, marginBottom: Spacing['3xl'] },
  field: { marginBottom: Spacing.lg },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.gray[700], marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, fontSize: FontSize.base, color: Colors.gray[900] },
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
  termsLink: { color: Colors.brand[600], fontWeight: FontWeight.medium },
  doneContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['3xl'], backgroundColor: Colors.brand[50] },
  doneTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, marginTop: Spacing.lg, color: Colors.gray[900] },
  doneSub: { fontSize: FontSize.base, color: Colors.gray[500], textAlign: 'center', marginTop: Spacing.sm },
})
