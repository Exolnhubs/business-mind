import { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { apiPost } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/theme'
import type { CommunityLevel, CommunityType } from '@/types/database'

const LEVEL_OPTIONS: Array<{ value: CommunityLevel; label: string; adminOnly?: boolean }> = [
  { value: 'micro', label: 'Micro' },
  { value: 'interest', label: 'Interest' },
  { value: 'district', label: 'District' },
  { value: 'city', label: 'City', adminOnly: true },
  { value: 'country', label: 'Country', adminOnly: true },
]

const TYPE_OPTIONS: Array<{ value: CommunityType; label: string }> = [
  { value: 'compound', label: 'Compound' },
  { value: 'neighborhood', label: 'Neighborhood' },
  { value: 'university', label: 'University' },
  { value: 'company', label: 'Company' },
  { value: 'coworking', label: 'Coworking' },
  { value: 'tech', label: 'Tech' },
  { value: 'sports', label: 'Sports' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'book_club', label: 'Book Club' },
  { value: 'entrepreneur', label: 'Entrepreneur' },
  { value: 'arts', label: 'Arts' },
  { value: 'other', label: 'Other' },
  { value: 'district', label: 'District' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
]

type CreateCommunityResponse = {
  id: string
  slug: string
}

export default function CreateCommunityScreen() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '',
    name_ar: '',
    description: '',
    description_ar: '',
    level: 'micro' as CommunityLevel,
    type: 'compound' as CommunityType,
    city: '',
    is_private: false,
  })

  const levelOptions = LEVEL_OPTIONS.filter((option) => !option.adminOnly || isAdmin)

  async function handleCreate() {
    if (!user) {
      router.push('/auth/login' as any)
      return
    }

    if (!form.name.trim()) {
      Alert.alert('Missing name', 'Please enter a community name.')
      return
    }

    setSubmitting(true)
    const { data, error } = await apiPost<CreateCommunityResponse>('/api/communities', {
      name: form.name.trim(),
      name_ar: form.name_ar.trim() || null,
      description: form.description.trim() || null,
      description_ar: form.description_ar.trim() || null,
      level: form.level,
      type: form.type,
      city: form.city.trim() || null,
      is_private: form.is_private,
      country: 'SA',
    })

    setSubmitting(false)

    if (error || !data?.slug) {
      Alert.alert('Could not create community', error ?? 'Please try again.')
      return
    }

    router.replace(`/communities/${data.slug}` as any)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.gray[800]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Community</Text>
          <TouchableOpacity onPress={handleCreate} disabled={submitting} style={[styles.createBtn, submitting && styles.createBtnDisabled]}>
            <Text style={styles.createBtnText}>{submitting ? '...' : 'Create'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Required</Text>
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={form.name}
            onChangeText={(name) => setForm((prev) => ({ ...prev, name }))}
            placeholder="Community name"
            placeholderTextColor={Colors.gray[400]}
            style={styles.input}
          />

          <Text style={[styles.label, styles.labelSpaced]}>Name in Arabic</Text>
          <TextInput
            value={form.name_ar}
            onChangeText={(name_ar) => setForm((prev) => ({ ...prev, name_ar }))}
            placeholder="اسم المجتمع"
            placeholderTextColor={Colors.gray[400]}
            style={styles.input}
            textAlign="right"
          />

          <Text style={[styles.label, styles.labelSpaced]}>Level</Text>
          <View style={styles.chipWrap}>
            {levelOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                onPress={() => setForm((prev) => ({ ...prev, level: option.value }))}
                style={[styles.chip, form.level === option.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, form.level === option.value && styles.chipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, styles.labelSpaced]}>Type</Text>
          <View style={styles.chipWrap}>
            {TYPE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                onPress={() => setForm((prev) => ({ ...prev, type: option.value }))}
                style={[styles.chip, form.type === option.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, form.type === option.value && styles.chipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Optional</Text>
          <Text style={styles.label}>Description</Text>
          <TextInput
            value={form.description}
            onChangeText={(description) => setForm((prev) => ({ ...prev, description }))}
            placeholder="What is this community about?"
            placeholderTextColor={Colors.gray[400]}
            style={[styles.input, styles.textarea]}
            multiline
            textAlignVertical="top"
          />

          <Text style={[styles.label, styles.labelSpaced]}>Description in Arabic</Text>
          <TextInput
            value={form.description_ar}
            onChangeText={(description_ar) => setForm((prev) => ({ ...prev, description_ar }))}
            placeholder="وصف المجتمع"
            placeholderTextColor={Colors.gray[400]}
            style={[styles.input, styles.textarea]}
            multiline
            textAlignVertical="top"
            textAlign="right"
          />

          <Text style={[styles.label, styles.labelSpaced]}>City</Text>
          <TextInput
            value={form.city}
            onChangeText={(city) => setForm((prev) => ({ ...prev, city }))}
            placeholder="City"
            placeholderTextColor={Colors.gray[400]}
            style={styles.input}
          />

          <View style={styles.privateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.privateTitle}>Private community</Text>
              <Text style={styles.privateHint}>Members need approval to join.</Text>
            </View>
            <Switch
              value={form.is_private}
              onValueChange={(is_private) => setForm((prev) => ({ ...prev, is_private }))}
              trackColor={{ false: Colors.gray[300], true: Colors.brand[400] }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f6fb',
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing['4xl'],
    gap: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xl,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.card,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
  },
  createBtn: {
    minWidth: 82,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand[600],
    alignItems: 'center',
  },
  createBtnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  sectionTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[700],
  },
  labelSpaced: {
    marginTop: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.gray[900],
    backgroundColor: '#fff',
  },
  textarea: {
    minHeight: 120,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[50],
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  chipActive: {
    backgroundColor: Colors.brand[600],
    borderColor: Colors.brand[600],
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[700],
  },
  chipTextActive: {
    color: '#fff',
  },
  privateRow: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  privateTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[900],
  },
  privateHint: {
    marginTop: 2,
    fontSize: FontSize.xs,
    color: Colors.gray[500],
  },
})
