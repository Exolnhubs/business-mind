import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Switch,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk', 'Abha', 'Taif']

interface Category {
  id: string
  name_en: string
  icon: string | null
}

export default function EventFormScreen() {
  const { user }   = useAuth()
  const router     = useRouter()
  const { id }     = useLocalSearchParams<{ id?: string }>()
  const isEdit     = !!id

  const [categories, setCategories] = useState<Category[]>([])
  const [loading,    setLoading]    = useState(isEdit)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Form fields
  const [title,             setTitle]             = useState('')
  const [titleAr,           setTitleAr]           = useState('')
  const [description,       setDescription]       = useState('')
  const [categoryId,        setCategoryId]        = useState('')
  const [city,              setCity]              = useState('')
  const [venueName,         setVenueName]         = useState('')
  const [address,           setAddress]           = useState('')
  const [startAt,           setStartAt]           = useState('')
  const [endAt,             setEndAt]             = useState('')
  const [capacity,          setCapacity]          = useState('')
  const [isFree,            setIsFree]            = useState(true)
  const [price,             setPrice]             = useState('')
  const [genderRestriction, setGenderRestriction] = useState<'mixed' | 'male' | 'female'>('mixed')
  const [isFamilyFriendly,  setIsFamilyFriendly]  = useState(true)
  const [isPublished,       setIsPublished]       = useState(false)

  // Load categories + existing event (if editing)
  useEffect(() => {
    async function init() {
      const { data: cats } = await supabase
        .from('event_categories')
        .select('id, name_en, icon')
        .eq('is_active', true)
        .order('sort_order')
      setCategories((cats ?? []) as Category[])

      if (id) {
        const { data: ev } = await supabase
          .from('events')
          .select('*')
          .eq('id', id)
          .eq('organizer_id', user!.id)
          .single()

        if (ev) {
          setTitle(ev.title)
          setTitleAr(ev.title_ar ?? '')
          setDescription(ev.description ?? '')
          setCategoryId(ev.category_id ?? '')
          setCity(ev.city)
          setVenueName(ev.venue_name ?? '')
          setAddress(ev.address ?? '')
          // Format datetime for display
          setStartAt(ev.start_at ? new Date(ev.start_at).toISOString().slice(0, 16).replace('T', ' ') : '')
          setEndAt(ev.end_at ? new Date(ev.end_at).toISOString().slice(0, 16).replace('T', ' ') : '')
          setCapacity(ev.capacity?.toString() ?? '')
          setIsFree(ev.is_free)
          setPrice(ev.price?.toString() ?? '')
          setGenderRestriction(ev.gender_restriction as 'mixed' | 'male' | 'female')
          setIsFamilyFriendly(ev.is_family_friendly)
          setIsPublished(ev.is_published)
        }
        setLoading(false)
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function save() {
    if (!title.trim()) { setError('Title is required.'); return }
    if (!city) { setError('City is required.'); return }
    if (!startAt) { setError('Start date is required.'); return }

    const parsedStart = new Date(startAt.includes('T') ? startAt : startAt.replace(' ', 'T'))
    if (isNaN(parsedStart.getTime())) { setError('Invalid start date. Use format: YYYY-MM-DD HH:MM'); return }

    const parsedEnd = endAt
      ? new Date(endAt.includes('T') ? endAt : endAt.replace(' ', 'T'))
      : null
    if (parsedEnd && isNaN(parsedEnd.getTime())) { setError('Invalid end date.'); return }

    setError(null)
    setSaving(true)

    const payload = {
      organizer_id: user!.id,
      title:               title.trim(),
      title_ar:            titleAr.trim() || null,
      description:         description.trim() || null,
      category_id:         categoryId || null,
      city,
      country:             'SA',
      venue_name:          venueName.trim() || null,
      address:             address.trim() || null,
      start_at:            parsedStart.toISOString(),
      end_at:              parsedEnd?.toISOString() ?? null,
      capacity:            capacity ? Number(capacity) : null,
      is_free:             isFree,
      price:               isFree ? null : Number(price),
      currency:            'SAR',
      gender_restriction:  genderRestriction,
      is_family_friendly:  isFamilyFriendly,
      is_published:        isPublished,
    }

    let dbError: { message: string } | null = null

    if (isEdit) {
      const { error } = await supabase
        .from('events')
        .update(payload)
        .eq('id', id)
        .eq('organizer_id', user!.id)
      dbError = error
    } else {
      const { error } = await supabase.from('events').insert(payload)
      dbError = error
    }

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    Alert.alert('Saved', isEdit ? 'Event updated.' : 'Event created.', [
      { text: 'OK', onPress: () => router.back() },
    ])
    setSaving(false)
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.brand[500]} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <Text style={styles.screenTitle}>{isEdit ? 'Edit Event' : 'Create Event'}</Text>

        {/* Title */}
        <Field label="Title *">
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Event title" placeholderTextColor={Colors.gray[400]} maxLength={200} />
        </Field>

        <Field label="Title (Arabic)">
          <TextInput style={[styles.input, { textAlign: 'right' }]} value={titleAr} onChangeText={setTitleAr} placeholder="العنوان بالعربية" placeholderTextColor={Colors.gray[400]} maxLength={200} />
        </Field>

        <Field label="Description">
          <TextInput style={[styles.input, styles.inputMulti]} value={description} onChangeText={setDescription} placeholder="Describe the event…" placeholderTextColor={Colors.gray[400]} multiline numberOfLines={4} maxLength={2000} />
        </Field>

        {/* Category */}
        <Field label="Category">
          <View style={styles.chipRow}>
            {categories.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, categoryId === c.id && styles.chipActive]}
                onPress={() => setCategoryId(categoryId === c.id ? '' : c.id)}
              >
                <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>
                  {c.icon ? `${c.icon} ` : ''}{c.name_en}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        {/* City */}
        <Field label="City *">
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
        </Field>

        <Field label="Venue Name">
          <TextInput style={styles.input} value={venueName} onChangeText={setVenueName} placeholder="Venue name" placeholderTextColor={Colors.gray[400]} maxLength={200} />
        </Field>

        <Field label="Address">
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Street address" placeholderTextColor={Colors.gray[400]} maxLength={300} />
        </Field>

        {/* Dates */}
        <Field label="Start Date & Time * (YYYY-MM-DD HH:MM)">
          <TextInput style={styles.input} value={startAt} onChangeText={setStartAt} placeholder="2025-06-15 18:00" placeholderTextColor={Colors.gray[400]} keyboardType="numbers-and-punctuation" maxLength={16} />
        </Field>

        <Field label="End Date & Time (optional)">
          <TextInput style={styles.input} value={endAt} onChangeText={setEndAt} placeholder="2025-06-15 21:00" placeholderTextColor={Colors.gray[400]} keyboardType="numbers-and-punctuation" maxLength={16} />
        </Field>

        {/* Capacity */}
        <Field label="Capacity (leave blank for unlimited)">
          <TextInput style={styles.input} value={capacity} onChangeText={setCapacity} placeholder="100" placeholderTextColor={Colors.gray[400]} keyboardType="number-pad" maxLength={6} />
        </Field>

        {/* Pricing */}
        <Field label="Pricing">
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Free Event</Text>
            <Switch value={isFree} onValueChange={setIsFree} trackColor={{ false: Colors.gray[200], true: Colors.brand[400] }} thumbColor={isFree ? Colors.brand[500] : Colors.gray[400]} />
          </View>
          {!isFree && (
            <TextInput
              style={[styles.input, { marginTop: Spacing.sm }]}
              value={price}
              onChangeText={setPrice}
              placeholder="Price in SAR"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="decimal-pad"
              maxLength={8}
            />
          )}
        </Field>

        {/* Gender restriction */}
        <Field label="Gender Restriction">
          <View style={styles.chipRow}>
            {(['mixed', 'male', 'female'] as const).map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.chip, genderRestriction === g && styles.chipActive]}
                onPress={() => setGenderRestriction(g)}
              >
                <Text style={[styles.chipText, genderRestriction === g && styles.chipTextActive]}>
                  {g === 'mixed' ? 'Mixed' : g === 'male' ? 'Male Only' : 'Female Only'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        {/* Toggles */}
        <Field label="Options">
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Family Friendly</Text>
            <Switch value={isFamilyFriendly} onValueChange={setIsFamilyFriendly} trackColor={{ false: Colors.gray[200], true: Colors.brand[400] }} thumbColor={isFamilyFriendly ? Colors.brand[500] : Colors.gray[400]} />
          </View>
          <View style={[styles.switchRow, { marginTop: Spacing.md }]}>
            <Text style={styles.switchLabel}>Publish immediately</Text>
            <Switch value={isPublished} onValueChange={setIsPublished} trackColor={{ false: Colors.gray[200], true: Colors.green.DEFAULT }} thumbColor={isPublished ? Colors.green.DEFAULT : Colors.gray[400]} />
          </View>
        </Field>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, (!title || !city || !startAt || saving) && styles.saveBtnDisabled]}
          onPress={save}
          disabled={!title || !city || !startAt || saving}
        >
          {saving
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={styles.saveBtnText}>{isEdit ? 'Save Changes' : 'Create Event'}</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
    </View>
  )
}

const fieldStyles = StyleSheet.create({
  wrap:  { marginBottom: Spacing.lg },
  label: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs },
})

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.gray[50] },
  content:         { padding: Spacing.lg, paddingBottom: Spacing['4xl'] },
  centered:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  screenTitle:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: Spacing['2xl'] },
  input:           { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: FontSize.base, color: Colors.gray[900], backgroundColor: Colors.white },
  inputMulti:      { height: 96, textAlignVertical: 'top' },
  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip:            { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.gray[200], marginBottom: Spacing.xs, backgroundColor: Colors.white },
  chipActive:      { borderColor: Colors.brand[500], backgroundColor: Colors.brand[50] },
  chipText:        { fontSize: FontSize.sm, color: Colors.gray[600] },
  chipTextActive:  { color: Colors.brand[600], fontWeight: FontWeight.semibold },
  switchRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.white, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.gray[200] },
  switchLabel:     { fontSize: FontSize.base, color: Colors.gray[800] },
  errorBox:        { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg },
  errorText:       { fontSize: FontSize.sm, color: '#b91c1c' },
  saveBtn:         { backgroundColor: Colors.brand[500], borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, alignItems: 'center', ...Shadow.card },
  saveBtnDisabled: { backgroundColor: Colors.gray[300] },
  saveBtnText:     { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.base },
})
