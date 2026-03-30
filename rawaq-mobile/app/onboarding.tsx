/**
 * Onboarding wizard shown once to new signups.
 *
 * Triggered by AuthGate when profile.gender is null (gender is not collected
 * during registration but is required for booking).
 *
 * USER path (5 steps):
 *   welcome → gender → photo/bio → interests → done
 *
 * ORGANIZER path (5 steps):
 *   welcome → gender → org-details → org-contact → done
 */

import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Image, Alert,
  Platform, KeyboardAvoidingView, SafeAreaView,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '@/lib/supabase'
import { uploadViaApi } from '@/lib/upload'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'

// ── Event category interests ───────────────────────────────────────────────
const CATEGORIES = [
  { id: 'sports',        en: 'Sports',         ar: 'رياضة',       icon: '⚽' },
  { id: 'arts',          en: 'Arts & Culture', ar: 'فنون وثقافة', icon: '🎨' },
  { id: 'music',         en: 'Music',          ar: 'موسيقى',      icon: '🎵' },
  { id: 'food',          en: 'Food & Drink',   ar: 'طعام وشراب',  icon: '🍽️' },
  { id: 'tech',          en: 'Technology',     ar: 'تقنية',       icon: '💻' },
  { id: 'business',      en: 'Business',       ar: 'أعمال',       icon: '💼' },
  { id: 'health',        en: 'Health',         ar: 'صحة ولياقة',  icon: '🏃' },
  { id: 'education',     en: 'Education',      ar: 'تعليم',       icon: '📚' },
  { id: 'entertainment', en: 'Entertainment',  ar: 'ترفيه',       icon: '🎭' },
  { id: 'community',     en: 'Community',      ar: 'مجتمع',       icon: '🤝' },
]

type StepId = 'welcome' | 'gender' | 'photo-bio' | 'interests' | 'org-details' | 'org-contact' | 'done'

const USER_STEPS:      StepId[] = ['welcome', 'gender', 'photo-bio', 'interests', 'done']
const ORGANIZER_STEPS: StepId[] = ['welcome', 'gender', 'org-details', 'org-contact', 'done']

const OPTIONAL_STEPS = new Set<StepId>(['photo-bio', 'interests', 'org-details', 'org-contact'])

export default function OnboardingScreen() {
  const { user, profile, refreshProfile } = useAuth()
  const { isRTL } = useLocale()
  const router = useRouter()

  const isOrganizer = profile?.role === 'organizer'
  const steps       = isOrganizer ? ORGANIZER_STEPS : USER_STEPS

  const [stepIndex, setStepIndex]   = useState(0)
  const [saving, setSaving]         = useState(false)

  // User profile fields
  const [gender, setGender]         = useState<'male' | 'female' | null>(null)
  const [bio, setBio]               = useState('')
  const [avatarUri, setAvatarUri]   = useState<string | null>(null)
  const [interests, setInterests]   = useState<string[]>([])

  // Organizer profile fields
  const [orgDesc, setOrgDesc]       = useState('')
  const [orgDescAr, setOrgDescAr]   = useState('')
  const [orgLogoUri, setOrgLogoUri] = useState<string | null>(null)
  const [orgWebsite, setOrgWebsite] = useState('')
  const [orgPhone, setOrgPhone]     = useState('')

  const currentStep = steps[stepIndex]
  const isLastStep  = stepIndex === steps.length - 1
  const isOptional  = OPTIONAL_STEPS.has(currentStep)
  const canProceed  = currentStep !== 'gender' || gender !== null

  // ── Image picker ───────────────────────────────────────────────────────────

  async function pickImage(target: 'avatar' | 'logo') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    })
    if (!result.canceled && result.assets[0]) {
      if (target === 'avatar') setAvatarUri(result.assets[0].uri)
      else                     setOrgLogoUri(result.assets[0].uri)
    }
  }

  // ── Save & complete ────────────────────────────────────────────────────────

  async function handleComplete() {
    if (!user) return
    setSaving(true)
    try {
      let avatarUrl = profile?.avatar_url ?? null
      if (avatarUri) avatarUrl = await uploadViaApi(avatarUri, 'avatar')

      let logoUrl: string | null = null
      if (orgLogoUri) logoUrl = await uploadViaApi(orgLogoUri, 'avatar')

      // Persist user profile
      await supabase
        .from('profiles')
        .update({
          gender:     gender ?? undefined,
          bio:        bio.trim() || null,
          avatar_url: avatarUrl,
          preferences: {
            ...(profile?.preferences as Record<string, unknown> ?? {}),
            onboarding_completed: true,
            interests,
          },
        } as any)
        .eq('id', user.id)

      // Persist organizer profile (if applicable)
      if (isOrganizer) {
        await supabase
          .from('organizer_profiles')
          .update({
            description:    orgDesc.trim()    || null,
            description_ar: orgDescAr.trim()  || null,
            logo_url:       logoUrl           ?? undefined,
            website:        orgWebsite.trim() || null,
            phone:          orgPhone.trim()   || null,
          } as any)
          .eq('user_id', user.id)
      }

      await refreshProfile()
      router.replace('/(tabs)/home')
    } catch {
      Alert.alert('Error', 'Could not save your profile. Please try again.')
      setSaving(false)
    }
  }

  function advance() {
    if (!canProceed) return
    if (isLastStep) handleComplete()
    else setStepIndex(i => i + 1)
  }

  function skip() {
    if (isLastStep) handleComplete()
    else setStepIndex(i => i + 1)
  }

  // ── Step renderers ─────────────────────────────────────────────────────────

  const firstName = profile?.display_name?.split(' ')[0] ?? 'there'

  function StepWelcome() {
    const bullets = isOrganizer
      ? ['Create & manage events', 'Sell tickets with ease', 'Track attendance & revenue']
      : ['Discover events near you', 'Book tickets in seconds', 'Connect with your community']
    return (
      <View style={s.stepContent}>
        <Text style={s.heroEmoji}>{isOrganizer ? '🏢' : '🎉'}</Text>
        <Text style={s.stepTitle}>
          {isOrganizer ? 'Set up your organizer profile' : `Welcome, ${firstName}!`}
        </Text>
        <Text style={s.stepSub}>
          {isOrganizer
            ? "A few quick steps so you can start creating unforgettable events."
            : "Just a few quick steps to personalise your Rawaq experience."}
        </Text>
        <View style={s.bulletList}>
          {bullets.map((b, i) => (
            <View key={i} style={s.bulletRow}>
              <Text style={s.bulletDot}>✦</Text>
              <Text style={s.bulletText}>{b}</Text>
            </View>
          ))}
        </View>
      </View>
    )
  }

  function StepGender() {
    return (
      <View style={s.stepContent}>
        <Text style={s.heroEmoji}>🧑‍🤝‍🧑</Text>
        <Text style={s.stepTitle}>Select your gender</Text>
        <Text style={s.stepSub}>
          This helps us show you relevant events and respects gender-restricted venues.
        </Text>
        <View style={s.genderRow}>
          {(['male', 'female'] as const).map((g) => (
            <TouchableOpacity
              key={g}
              style={[s.genderCard, gender === g && s.genderCardActive]}
              onPress={() => setGender(g)}
              activeOpacity={0.8}
            >
              <Text style={s.genderEmoji}>{g === 'male' ? '👨' : '👩'}</Text>
              <Text style={[s.genderLabel, gender === g && s.genderLabelActive]}>
                {g === 'male' ? 'Male' : 'Female'}
              </Text>
              {gender === g && (
                <View style={s.genderTick}>
                  <Text style={{ color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold }}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.notice}>
          <Text style={s.noticeText}>⚠️  This cannot be changed after you save it.</Text>
        </View>
      </View>
    )
  }

  function StepPhotoBio() {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.stepContent}>
          <Text style={s.heroEmoji}>📸</Text>
          <Text style={s.stepTitle}>Add a photo & bio</Text>
          <Text style={s.stepSub}>Help others recognise you. You can always update this later.</Text>

          <TouchableOpacity style={s.avatarWrap} onPress={() => pickImage('avatar')} activeOpacity={0.8}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={s.avatarImg} />
            ) : (
              <View style={s.avatarEmpty}>
                <Text style={{ fontSize: 32 }}>📷</Text>
                <Text style={s.pickText}>Tap to pick a photo</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={s.fieldWrap}>
            <Text style={s.label}>
              Bio <Text style={s.optionalTag}>(optional)</Text>
            </Text>
            <TextInput
              style={[s.textArea, isRTL && s.rtlText]}
              value={bio}
              onChangeText={t => { if (t.length <= 500) setBio(t) }}
              placeholder="Tell people a bit about yourself…"
              placeholderTextColor={Colors.gray[400]}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              textAlign={isRTL ? 'right' : 'left'}
            />
            <Text style={s.charCount}>{bio.length}/500</Text>
          </View>
        </View>
      </ScrollView>
    )
  }

  function StepInterests() {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.stepContent}>
          <Text style={s.heroEmoji}>🎯</Text>
          <Text style={s.stepTitle}>What are you into?</Text>
          <Text style={s.stepSub}>
            Pick your interests so we can recommend events you'll love.
          </Text>
          <View style={s.chipGrid}>
            {CATEGORIES.map((cat) => {
              const on = interests.includes(cat.id)
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[s.chip, on && s.chipOn]}
                  onPress={() =>
                    setInterests(prev =>
                      on ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
                    )
                  }
                  activeOpacity={0.8}
                >
                  <Text style={s.chipIcon}>{cat.icon}</Text>
                  <Text style={[s.chipLabel, on && s.chipLabelOn]}>
                    {isRTL ? cat.ar : cat.en}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </ScrollView>
    )
  }

  function StepOrgDetails() {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.stepContent}>
          <Text style={s.heroEmoji}>📝</Text>
          <Text style={s.stepTitle}>Tell your story</Text>
          <Text style={s.stepSub}>Describe your brand so attendees know what to expect.</Text>

          <TouchableOpacity style={s.logoWrap} onPress={() => pickImage('logo')} activeOpacity={0.8}>
            {orgLogoUri ? (
              <Image source={{ uri: orgLogoUri }} style={s.logoImg} />
            ) : (
              <View style={s.logoEmpty}>
                <Text style={{ fontSize: 26 }}>🖼️</Text>
                <Text style={s.pickText}>Upload logo (optional)</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={s.fieldWrap}>
            <Text style={s.label}>
              Description <Text style={s.optionalTag}>(English)</Text>
            </Text>
            <TextInput
              style={s.textArea}
              value={orgDesc}
              onChangeText={t => { if (t.length <= 500) setOrgDesc(t) }}
              placeholder="We create unforgettable experiences…"
              placeholderTextColor={Colors.gray[400]}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Text style={s.charCount}>{orgDesc.length}/500</Text>
          </View>

          <View style={s.fieldWrap}>
            <Text style={[s.label, s.rtlText]}>
              الوصف <Text style={s.optionalTag}>(عربي)</Text>
            </Text>
            <TextInput
              style={[s.textArea, s.rtlText]}
              value={orgDescAr}
              onChangeText={t => { if (t.length <= 500) setOrgDescAr(t) }}
              placeholder="نصنع تجارب لا تُنسى…"
              placeholderTextColor={Colors.gray[400]}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              textAlign="right"
            />
            <Text style={[s.charCount, s.rtlText]}>{orgDescAr.length}/500</Text>
          </View>
        </View>
      </ScrollView>
    )
  }

  function StepOrgContact() {
    const fields = [
      { label: 'Website', placeholder: 'https://myevents.com', value: orgWebsite, set: setOrgWebsite, kb: 'url' },
      { label: 'Phone',   placeholder: '+966 5x xxx xxxx',      value: orgPhone,   set: setOrgPhone,   kb: 'phone-pad' },
    ] as const
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.stepContent}>
          <Text style={s.heroEmoji}>📞</Text>
          <Text style={s.stepTitle}>Contact details</Text>
          <Text style={s.stepSub}>Help attendees find and reach you online.</Text>
          {fields.map(({ label, placeholder, value, set, kb }) => (
            <View key={label} style={s.fieldWrap}>
              <Text style={s.label}>
                {label} <Text style={s.optionalTag}>(optional)</Text>
              </Text>
              <TextInput
                style={[s.input, isRTL && s.rtlText]}
                value={value}
                onChangeText={set as (v: string) => void}
                placeholder={placeholder}
                placeholderTextColor={Colors.gray[400]}
                keyboardType={kb as any}
                autoCapitalize="none"
                textAlign={isRTL ? 'right' : 'left'}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    )
  }

  function StepDone() {
    return (
      <View style={[s.stepContent, s.doneContent]}>
        <Text style={{ fontSize: 72 }}>{isOrganizer ? '🎊' : '🚀'}</Text>
        <Text style={[s.stepTitle, { textAlign: 'center' }]}>
          {isOrganizer ? "You're almost live!" : "You're all set!"}
        </Text>
        <Text style={[s.stepSub, { textAlign: 'center' }]}>
          {isOrganizer
            ? 'Your profile is submitted for review. Explore the app while we verify your account.'
            : 'Your profile is ready. Start discovering events near you!'}
        </Text>
        {isOrganizer && (
          <View style={s.pendingBadge}>
            <Text style={s.pendingText}>⏳  Pending admin review</Text>
          </View>
        )}
      </View>
    )
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  const ctaLabel = isLastStep
    ? (isOrganizer ? "Let's go!" : 'Start exploring')
    : 'Continue'

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Progress indicator */}
        <View style={s.progressRow}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[
                s.dot,
                i < stepIndex  && s.dotPast,
                i === stepIndex && s.dotCurrent,
              ]}
            />
          ))}
        </View>

        {/* Step body */}
        <View style={{ flex: 1 }}>
          {currentStep === 'welcome'     && <StepWelcome />}
          {currentStep === 'gender'      && <StepGender />}
          {currentStep === 'photo-bio'   && <StepPhotoBio />}
          {currentStep === 'interests'   && <StepInterests />}
          {currentStep === 'org-details' && <StepOrgDetails />}
          {currentStep === 'org-contact' && <StepOrgContact />}
          {currentStep === 'done'        && <StepDone />}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          {isOptional && !isLastStep && (
            <TouchableOpacity onPress={skip} style={s.skipBtn} activeOpacity={0.7}>
              <Text style={s.skipLabel}>Skip for now</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.cta, (!canProceed || saving) && s.ctaOff]}
            onPress={advance}
            disabled={!canProceed || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={s.ctaLabel}>{ctaLabel}</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.brand[50],
  },

  // Progress
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.gray[200],
  },
  dotPast: {
    backgroundColor: Colors.brand[300],
    width: 8,
  },
  dotCurrent: {
    width: 24,
    backgroundColor: Colors.brand[500],
  },

  // Step shell
  stepContent: {
    flex: 1,
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing['2xl'],
  },
  heroEmoji: {
    fontSize: 52,
    marginBottom: Spacing.lg,
  },
  stepTitle: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
  },
  stepSub: {
    fontSize: FontSize.base,
    color: Colors.gray[500],
    lineHeight: 22,
    marginBottom: Spacing['2xl'],
  },

  // Welcome bullets
  bulletList: { gap: Spacing.md },
  bulletRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  bulletDot:  { fontSize: 13, color: Colors.brand[500] },
  bulletText: { fontSize: FontSize.base, color: Colors.gray[700], fontWeight: FontWeight.medium },

  // Gender
  genderRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  genderCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
    borderRadius: Radius.xl,
    borderWidth: 2,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    gap: Spacing.sm,
    position: 'relative',
  },
  genderCardActive: {
    borderColor: Colors.brand[400],
    backgroundColor: Colors.brand[50],
  },
  genderEmoji: { fontSize: 38 },
  genderLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[600] },
  genderLabelActive: { color: Colors.brand[700] },
  genderTick: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.brand[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  noticeText: { fontSize: FontSize.sm, color: '#92400e', lineHeight: 18 },

  // Avatar / logo pickers
  avatarWrap: { alignSelf: 'center', marginBottom: Spacing['2xl'] },
  avatarImg: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 3, borderColor: Colors.brand[300],
  },
  avatarEmpty: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.white,
    borderWidth: 2, borderColor: Colors.gray[200], borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  logoWrap: { alignSelf: 'center', marginBottom: Spacing['2xl'] },
  logoImg: {
    width: 80, height: 80, borderRadius: Radius.lg,
    borderWidth: 2, borderColor: Colors.brand[300],
  },
  logoEmpty: {
    width: 80, height: 80, borderRadius: Radius.lg,
    backgroundColor: Colors.white,
    borderWidth: 2, borderColor: Colors.gray[200], borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  pickText: { fontSize: FontSize.xs, color: Colors.gray[400], textAlign: 'center' },

  // Form elements
  fieldWrap: { marginBottom: Spacing.lg },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.gray[700], marginBottom: 6 },
  optionalTag: { fontWeight: FontWeight.normal, color: Colors.gray[400] },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.gray[200],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    fontSize: FontSize.base, color: Colors.gray[900],
  },
  textArea: {
    backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.gray[200],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    fontSize: FontSize.base, color: Colors.gray[900],
    minHeight: 100,
  },
  rtlText: { textAlign: 'right' },
  charCount: { fontSize: FontSize.xs, color: Colors.gray[400], textAlign: 'right', marginTop: 4 },

  // Interests grid
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingBottom: Spacing['3xl'] },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  chipOn: { borderColor: Colors.brand[400], backgroundColor: Colors.brand[50] },
  chipIcon: { fontSize: 15 },
  chipLabel: { fontSize: FontSize.sm, color: Colors.gray[600], fontWeight: FontWeight.medium },
  chipLabelOn: { color: Colors.brand[700] },

  // Done screen
  doneContent: { alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  pendingBadge: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand[100],
  },
  pendingText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.brand[700] },

  // Footer
  footer: {
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Platform.OS === 'ios' ? Spacing['2xl'] : Spacing.xl,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  skipBtn: { alignItems: 'center', paddingVertical: Spacing.xs },
  skipLabel: { fontSize: FontSize.sm, color: Colors.gray[400] },
  cta: {
    backgroundColor: Colors.brand[500],
    borderRadius: Radius.xl,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    ...Shadow.card,
  },
  ctaOff: { opacity: 0.5 },
  ctaLabel: { color: Colors.white, fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
})
