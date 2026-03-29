import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Switch,
  KeyboardAvoidingView, Platform, Image, Modal, FlatList,
} from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useRouter, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'
import { uploadViaApi } from '@/lib/upload'
import { useAuth } from '@/contexts/auth-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Tabuk', 'Abha', 'Taif']
const TEMPLATES_KEY = 'rawaq_ticket_templates'

interface Category { id: string; name_en: string; icon: string | null }
type TicketDraft = { name: string; is_free: boolean; price: string; capacity: string }
type TicketTemplate = TicketDraft & { id: string }

const EMPTY_TICKET: TicketDraft = { name: '', is_free: true, price: '', capacity: '' }

const BUILTIN_TEMPLATES: TicketTemplate[] = [
  { id: '_general',   name: 'General Admission', is_free: true,  price: '',    capacity: '' },
  { id: '_vip',       name: 'VIP',               is_free: false, price: '100', capacity: '' },
  { id: '_earlybird', name: 'Early Bird',         is_free: false, price: '25',  capacity: '50' },
  { id: '_premium',   name: 'Premium',            is_free: false, price: '200', capacity: '' },
]

export default function EventFormScreen() {
  const { user }   = useAuth()
  const router     = useRouter()
  const { id }     = useLocalSearchParams<{ id?: string }>()
  const isEdit     = !!id

  const [categories, setCategories] = useState<Category[]>([])
  const [loading,    setLoading]    = useState(isEdit)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Wizard step (create only): 1 = details, 2 = tickets, 3 = review
  const [step,           setStep]           = useState<1 | 2 | 3>(1)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)

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
  // Date picker state
  const [pickerTarget,  setPickerTarget]  = useState<'start' | 'end' | null>(null)
  const [pickerMode,    setPickerMode]    = useState<'date' | 'time'>('date')
  const [pickerTempDate, setPickerTempDate] = useState<Date>(new Date())
  const [capacity,          setCapacity]          = useState('')
  const [isFree,            setIsFree]            = useState(true)
  const [price,             setPrice]             = useState('')
  const [genderRestriction, setGenderRestriction] = useState<'mixed' | 'male' | 'female'>('mixed')
  const [isFamilyFriendly,  setIsFamilyFriendly]  = useState(true)
  const [isPublished,       setIsPublished]       = useState(false)

  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [coverUploading, setCoverUploading] = useState(false)

  // Ticket types (create wizard only)
  const [tickets, setTickets] = useState<TicketDraft[]>([{ ...EMPTY_TICKET, name: 'General Admission' }])

  // Ticket templates
  const [templates, setTemplates]       = useState<TicketTemplate[]>([])
  const [showTemplates, setShowTemplates] = useState(false)

  const loadTemplates = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(TEMPLATES_KEY)
      const saved: TicketTemplate[] = raw ? JSON.parse(raw) : []
      setTemplates(saved)
    } catch {}
  }, [])

  async function saveAsTemplate(ticket: TicketDraft) {
    if (!ticket.name.trim()) {
      Alert.alert('Name required', 'Give the ticket type a name before saving as template.')
      return
    }
    const newTpl: TicketTemplate = { ...ticket, id: Date.now().toString() }
    const updated = [...templates, newTpl]
    setTemplates(updated)
    await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated))
    Alert.alert('Saved', `"${ticket.name}" saved as a template.`)
  }

  async function deleteTemplate(id: string) {
    const updated = templates.filter((t) => t.id !== id)
    setTemplates(updated)
    await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated))
  }

  function applyTemplate(tpl: TicketTemplate) {
    const { id: _id, ...draft } = tpl
    setTickets((prev) => [...prev, { ...draft }])
    setShowTemplates(false)
  }

  useEffect(() => { loadTemplates() }, [loadTemplates])

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
          setStartAt(ev.start_at ? new Date(ev.start_at).toISOString().slice(0, 16).replace('T', ' ') : '')
          setEndAt(ev.end_at ? new Date(ev.end_at).toISOString().slice(0, 16).replace('T', ' ') : '')
          setCapacity(ev.capacity?.toString() ?? '')
          setIsFree(ev.is_free)
          setPrice(ev.price?.toString() ?? '')
          setGenderRestriction(ev.gender_restriction as 'mixed' | 'male' | 'female')
          setIsFamilyFriendly(ev.is_family_friendly)
          setIsPublished(ev.is_published)
          setCoverImageUrl(ev.cover_image_url ?? '')
        }
        setLoading(false)
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function parseDate(val: string) {
    return new Date(val.includes('T') ? val : val.replace(' ', 'T'))
  }

  function formatDisplay(iso: string) {
    if (!iso) return 'Select date & time'
    const d = parseDate(iso)
    return d.toLocaleString('en-SA-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' })
  }

  function openPicker(target: 'start' | 'end') {
    const current = target === 'start' ? startAt : endAt
    setPickerTempDate(current ? parseDate(current) : new Date())
    setPickerMode('date')
    setPickerTarget(target)
  }

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (!selected || event.type === 'dismissed') {
      setPickerTarget(null)
      return
    }
    if (pickerMode === 'date') {
      setPickerTempDate(selected)
      setPickerMode('time')   // advance to time selection
    } else {
      // Both date and time chosen — commit
      const iso = selected.toISOString().slice(0, 16).replace('T', ' ')
      if (pickerTarget === 'start') setStartAt(iso)
      else setEndAt(iso)
      setPickerTarget(null)
    }
  }

  async function pickCoverImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      videoMaxDuration: 120,
    })
    if (result.canceled || !result.assets[0]) return

    setCoverUploading(true)
    try {
      const url = await uploadViaApi(result.assets[0].uri, 'event-cover')
      setCoverImageUrl(url)
    } catch (e: unknown) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setCoverUploading(false)
    }
  }

  // ─── Edit mode: save directly ───────────────────────────────────────────────
  async function saveEdit() {
    if (!title.trim()) { setError('Title is required.'); return }
    if (!city) { setError('City is required.'); return }
    if (!startAt) { setError('Start date is required.'); return }
    const parsedStart = parseDate(startAt)
    if (isNaN(parsedStart.getTime())) { setError('Invalid start date.'); return }
    const parsedEnd = endAt ? parseDate(endAt) : null
    if (parsedEnd && isNaN(parsedEnd.getTime())) { setError('Invalid end date.'); return }

    setError(null)
    setSaving(true)

    const { error: dbError } = await supabase
      .from('events')
      .update({
        organizer_id:       user!.id,
        title:              title.trim(),
        title_ar:           titleAr.trim() || null,
        description:        description.trim() || null,
        category_id:        categoryId || null,
        city,
        country:            'SA',
        venue_name:         venueName.trim() || null,
        address:            address.trim() || null,
        start_at:           parsedStart.toISOString(),
        end_at:             parsedEnd?.toISOString() ?? null,
        capacity:           capacity ? Number(capacity) : null,
        is_free:            isFree,
        price:              isFree ? null : Number(price),
        currency:           'SAR',
        gender_restriction: genderRestriction,
        is_family_friendly: isFamilyFriendly,
        is_published:       isPublished,
        cover_image_url:    coverImageUrl || null,
      })
      .eq('id', id)
      .eq('organizer_id', user!.id)

    setSaving(false)
    if (dbError) { setError(dbError.message); return }

    Alert.alert('Saved', 'Event updated.', [{ text: 'OK', onPress: () => router.back() }])
  }

  // ─── Create wizard step 1: create/update draft event ───────────────────────
  async function handleStep1() {
    if (!title.trim()) { setError('Title is required.'); return }
    if (!city) { setError('City is required.'); return }
    if (!startAt) { setError('Start date is required.'); return }
    const parsedStart = parseDate(startAt)
    if (isNaN(parsedStart.getTime())) { setError('Invalid start date. Use YYYY-MM-DD HH:MM'); return }
    const parsedEnd = endAt ? parseDate(endAt) : null
    if (parsedEnd && isNaN(parsedEnd.getTime())) { setError('Invalid end date.'); return }

    setError(null)
    setSaving(true)

    const payload = {
      organizer_id:       user!.id,
      title:              title.trim(),
      title_ar:           titleAr.trim() || null,
      description:        description.trim() || null,
      category_id:        categoryId || null,
      city,
      country:            'SA',
      venue_name:         venueName.trim() || null,
      address:            address.trim() || null,
      start_at:           parsedStart.toISOString(),
      end_at:             parsedEnd?.toISOString() ?? null,
      capacity:           capacity ? Number(capacity) : null,
      is_free:            true,
      currency:           'SAR',
      gender_restriction: genderRestriction,
      is_family_friendly: isFamilyFriendly,
      is_published:       false,
      cover_image_url:    coverImageUrl || null,
    }

    // If user went back from step 2 and re-submitted, update the existing draft
    if (createdEventId) {
      const { error: dbError } = await supabase
        .from('events')
        .update(payload)
        .eq('id', createdEventId)
      setSaving(false)
      if (dbError) { setError(dbError.message); return }
      setStep(2)
      return
    }

    const { data: newEvent, error: dbError } = await supabase
      .from('events')
      .insert(payload)
      .select('id')
      .single()

    setSaving(false)
    if (dbError) { setError(dbError.message); return }

    setCreatedEventId(newEvent.id)
    setStep(2)
  }

  // ─── Create wizard step 2: save ticket types ────────────────────────────────
  async function handleStep2() {
    if (tickets.length === 0) { setError('Add at least one ticket type'); return }
    for (const t of tickets) {
      if (!t.name.trim()) { setError('All ticket types need a name'); return }
      if (!t.is_free && (!t.price || Number(t.price) <= 0)) { setError('Paid ticket types need a price'); return }
    }
    setError(null)
    setSaving(true)

    const eventId = createdEventId!
    const allFree = tickets.every((t) => t.is_free)

    // Delete any previously saved ticket types (handles "Back → re-submit" case)
    await supabase.from('ticket_types').delete().eq('event_id', eventId)

    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i]
      const { error: dbErr } = await supabase
        .from('ticket_types')
        .insert({
          event_id:   eventId,
          name:       t.name.trim(),
          price:      t.is_free ? 0 : Number(t.price),
          capacity:   t.capacity ? Number(t.capacity) : null,
          is_free:    t.is_free,
          sort_order: i,
        })
      if (dbErr) {
        setError(dbErr.message)
        setSaving(false)
        return
      }
    }

    await supabase.from('events').update({ is_free: allFree }).eq('id', eventId)

    setSaving(false)
    setStep(3)
  }

  // ─── Create wizard step 3: finalize ─────────────────────────────────────────
  async function finalize(publish: boolean) {
    setSaving(true)
    const { error: dbError } = await supabase
      .from('events')
      .update({ is_published: publish })
      .eq('id', createdEventId!)
    setSaving(false)
    if (dbError) { Alert.alert('Error', dbError.message); return }
    Alert.alert(
      publish ? 'Published!' : 'Saved as Draft',
      publish ? 'Your event is now live.' : 'You can publish it from your dashboard.',
      [{ text: 'OK', onPress: () => router.back() }],
    )
  }

  function updateTicket(i: number, key: keyof TicketDraft, value: string | boolean) {
    setTickets((prev) => prev.map((t, idx) => idx === i ? { ...t, [key]: value } : t))
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

        {/* ── Step indicator (create only) ── */}
        {!isEdit && (
          <View style={styles.stepRow}>
            {(['Details', 'Tickets', 'Review'] as const).map((label, i) => {
              const n = i + 1
              const done = step > n
              const active = step === n
              return (
                <View key={label} style={styles.stepItem}>
                  <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                    <Text style={[styles.stepDotText, (done || active) && styles.stepDotTextActive]}>
                      {done ? '✓' : n}
                    </Text>
                  </View>
                  <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
                </View>
              )
            })}
          </View>
        )}

        <Text style={styles.screenTitle}>
          {isEdit ? 'Edit Event' : step === 1 ? 'Event Details' : step === 2 ? 'Ticket Types' : 'Review & Publish'}
        </Text>

        {/* ── Step 1 / Edit: Event details ── */}
        {(isEdit || step === 1) && (
          <>
            <Field label="Title *">
              <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Event title" placeholderTextColor={Colors.gray[400]} maxLength={200} />
            </Field>

            <Field label="Title (Arabic)">
              <TextInput style={[styles.input, { textAlign: 'right' }]} value={titleAr} onChangeText={setTitleAr} placeholder="العنوان بالعربية" placeholderTextColor={Colors.gray[400]} maxLength={200} />
            </Field>

            <Field label="Description">
              <TextInput style={[styles.input, styles.inputMulti]} value={description} onChangeText={setDescription} placeholder="Describe the event…" placeholderTextColor={Colors.gray[400]} multiline numberOfLines={4} maxLength={2000} />
            </Field>

            <Field label="Cover Image / Video">
              <TouchableOpacity onPress={pickCoverImage} disabled={coverUploading} style={styles.coverPicker}>
                {coverImageUrl ? (
                  <Image source={{ uri: coverImageUrl }} style={styles.coverPreview} resizeMode="cover" />
                ) : (
                  <View style={styles.coverPlaceholder}>
                    {coverUploading
                      ? <ActivityIndicator color={Colors.brand[500]} />
                      : <Text style={styles.coverPlaceholderText}>🖼️  Tap to upload cover</Text>
                    }
                  </View>
                )}
              </TouchableOpacity>
            </Field>

            <Field label="Category">
              <View style={styles.chipRow}>
                {categories.map((c) => (
                  <TouchableOpacity key={c.id} style={[styles.chip, categoryId === c.id && styles.chipActive]} onPress={() => setCategoryId(categoryId === c.id ? '' : c.id)}>
                    <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>
                      {c.icon ? `${c.icon} ` : ''}{c.name_en}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="City *">
              <View style={styles.chipRow}>
                {CITIES.map((c) => (
                  <TouchableOpacity key={c} style={[styles.chip, city === c && styles.chipActive]} onPress={() => setCity(city === c ? '' : c)}>
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

            <Field label="Start Date & Time *">
              <TouchableOpacity style={styles.datePicker} onPress={() => openPicker('start')}>
                <Text style={[styles.datePickerText, !startAt && styles.datePickerPlaceholder]}>
                  {formatDisplay(startAt)}
                </Text>
                <Text style={styles.datePickerIcon}>📅</Text>
              </TouchableOpacity>
            </Field>

            <Field label="End Date & Time (optional)">
              <TouchableOpacity style={styles.datePicker} onPress={() => openPicker('end')}>
                <Text style={[styles.datePickerText, !endAt && styles.datePickerPlaceholder]}>
                  {endAt ? formatDisplay(endAt) : 'Select end date & time'}
                </Text>
                {endAt
                  ? <TouchableOpacity onPress={() => setEndAt('')}><Text style={styles.dateClear}>✕</Text></TouchableOpacity>
                  : <Text style={styles.datePickerIcon}>📅</Text>
                }
              </TouchableOpacity>
            </Field>

            {pickerTarget !== null && (
              <DateTimePicker
                value={pickerTempDate}
                mode={pickerMode}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={onPickerChange}
              />
            )}

            <Field label="Total Capacity (blank = unlimited)">
              <TextInput style={styles.input} value={capacity} onChangeText={setCapacity} placeholder="100" placeholderTextColor={Colors.gray[400]} keyboardType="number-pad" maxLength={6} />
            </Field>

            {/* Edit mode keeps price field */}
            {isEdit && (
              <Field label="Pricing">
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Free Event</Text>
                  <Switch value={isFree} onValueChange={setIsFree} trackColor={{ false: Colors.gray[200], true: Colors.brand[400] }} thumbColor={isFree ? Colors.brand[500] : Colors.gray[400]} />
                </View>
                {!isFree && (
                  <TextInput style={[styles.input, { marginTop: Spacing.sm }]} value={price} onChangeText={setPrice} placeholder="Price in SAR" placeholderTextColor={Colors.gray[400]} keyboardType="decimal-pad" maxLength={8} />
                )}
              </Field>
            )}

            <Field label="Gender Restriction">
              <View style={styles.chipRow}>
                {(['mixed', 'male', 'female'] as const).map((g) => (
                  <TouchableOpacity key={g} style={[styles.chip, genderRestriction === g && styles.chipActive]} onPress={() => setGenderRestriction(g)}>
                    <Text style={[styles.chipText, genderRestriction === g && styles.chipTextActive]}>
                      {g === 'mixed' ? 'Mixed' : g === 'male' ? 'Male Only' : 'Female Only'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="Options">
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Family Friendly</Text>
                <Switch value={isFamilyFriendly} onValueChange={setIsFamilyFriendly} trackColor={{ false: Colors.gray[200], true: Colors.brand[400] }} thumbColor={isFamilyFriendly ? Colors.brand[500] : Colors.gray[400]} />
              </View>
              {isEdit && (
                <View style={[styles.switchRow, { marginTop: Spacing.md }]}>
                  <Text style={styles.switchLabel}>Published</Text>
                  <Switch value={isPublished} onValueChange={setIsPublished} trackColor={{ false: Colors.gray[200], true: Colors.green.DEFAULT }} thumbColor={isPublished ? Colors.green.DEFAULT : Colors.gray[400]} />
                </View>
              )}
            </Field>

            {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={isEdit ? saveEdit : handleStep1}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.saveBtnText}>{isEdit ? 'Save Changes' : 'Next: Add Tickets →'}</Text>
              }
            </TouchableOpacity>
          </>
        )}

        {/* ── Step 2: Ticket types ── */}
        {!isEdit && step === 2 && (
          <>
            <Text style={styles.stepHint}>Define pricing tiers. Add multiple types like Early Bird, General, VIP.</Text>

            {/* Template picker row */}
            <TouchableOpacity style={styles.templatePickerBtn} onPress={() => setShowTemplates(true)}>
              <Text style={styles.templatePickerBtnText}>📋  Add from template</Text>
            </TouchableOpacity>

            {tickets.map((t, i) => (
              <View key={i} style={styles.ticketCard}>
                <View style={styles.ticketCardHeader}>
                  <Text style={styles.ticketCardTitle}>Ticket Type {i + 1}</Text>
                  <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => saveAsTemplate(t)}>
                      <Text style={styles.saveTemplateText}>Save as template</Text>
                    </TouchableOpacity>
                    {tickets.length > 1 && (
                      <TouchableOpacity onPress={() => setTickets((prev) => prev.filter((_, idx) => idx !== i))}>
                        <Text style={styles.removeText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <Field label="Name *">
                  <TextInput style={styles.input} value={t.name} onChangeText={(v) => updateTicket(i, 'name', v)} placeholder="e.g. General Admission" placeholderTextColor={Colors.gray[400]} />
                </Field>

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Free Ticket</Text>
                  <Switch value={t.is_free} onValueChange={(v) => updateTicket(i, 'is_free', v)} trackColor={{ false: Colors.gray[200], true: Colors.brand[400] }} thumbColor={t.is_free ? Colors.brand[500] : Colors.gray[400]} />
                </View>

                {!t.is_free && (
                  <Field label="Price (SAR)">
                    <TextInput style={[styles.input, { marginTop: 4 }]} value={t.price} onChangeText={(v) => updateTicket(i, 'price', v)} placeholder="0.00" placeholderTextColor={Colors.gray[400]} keyboardType="decimal-pad" />
                  </Field>
                )}

                <Field label="Capacity (blank = unlimited)">
                  <TextInput style={styles.input} value={t.capacity} onChangeText={(v) => updateTicket(i, 'capacity', v)} placeholder="Unlimited" placeholderTextColor={Colors.gray[400]} keyboardType="number-pad" />
                </Field>
              </View>
            ))}

            <TouchableOpacity onPress={() => setTickets((prev) => [...prev, { ...EMPTY_TICKET }])} style={styles.addTypeBtn}>
              <Text style={styles.addTypeBtnText}>+ Add blank ticket type</Text>
            </TouchableOpacity>

            {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

            <View style={styles.btnRow}>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1 }, saving && styles.saveBtnDisabled]} onPress={handleStep2} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.saveBtnText}>Next: Review →</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.backBtn} onPress={() => { setStep(1); setError(null) }}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Step 3: Review & publish ── */}
        {!isEdit && step === 3 && (
          <>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewSectionTitle}>Event</Text>
              <ReviewRow label="Title" value={title} />
              <ReviewRow label="City" value={city} />
              <ReviewRow label="Starts" value={startAt} />
              {venueName ? <ReviewRow label="Venue" value={venueName} /> : null}
            </View>

            <View style={[styles.reviewCard, { marginTop: Spacing.md }]}>
              <Text style={styles.reviewSectionTitle}>Ticket Types</Text>
              {tickets.map((t, i) => (
                <View key={i} style={styles.reviewTicketRow}>
                  <Text style={styles.reviewTicketName}>{t.name}</Text>
                  <Text style={styles.reviewTicketPrice}>
                    {t.is_free ? 'Free' : `SAR ${t.price}`}
                    {t.capacity ? `  ·  ${t.capacity} cap` : ''}
                  </Text>
                </View>
              ))}
            </View>

            {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

            <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={() => finalize(true)} disabled={saving}>
              {saving
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.saveBtnText}>Publish Event</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={[styles.draftBtn, { marginTop: Spacing.sm }]} onPress={() => finalize(false)} disabled={saving}>
              <Text style={styles.draftBtnText}>Save as Draft</Text>
            </TouchableOpacity>

            <TouchableOpacity style={{ marginTop: Spacing.md, alignItems: 'center' }} onPress={() => { setStep(2); setError(null) }}>
              <Text style={styles.backBtnText}>← Back to Tickets</Text>
            </TouchableOpacity>
          </>
        )}

      </ScrollView>

      {/* ── Ticket template picker modal ── */}
      <Modal visible={showTemplates} animationType="slide" transparent onRequestClose={() => setShowTemplates(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ticket Templates</Text>
              <TouchableOpacity onPress={() => setShowTemplates(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={[...BUILTIN_TEMPLATES, ...templates]}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={() => (
                <Text style={styles.templateSectionLabel}>
                  {templates.length > 0 ? 'Built-in & saved' : 'Built-in templates'}
                </Text>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: Colors.gray[100] }} />}
              renderItem={({ item }) => {
                const isCustom = !item.id.startsWith('_')
                return (
                  <TouchableOpacity style={styles.templateRow} onPress={() => applyTemplate(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.templateName}>{item.name}</Text>
                      <Text style={styles.templateMeta}>
                        {item.is_free ? 'Free' : `SAR ${item.price}`}
                        {item.capacity ? `  ·  ${item.capacity} cap` : '  ·  Unlimited'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
                      {isCustom && (
                        <TouchableOpacity
                          onPress={() => Alert.alert('Delete template', `Remove "${item.name}"?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deleteTemplate(item.id) },
                          ])}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.templateDeleteText}>🗑</Text>
                        </TouchableOpacity>
                      )}
                      <Text style={styles.templateAdd}>+ Add</Text>
                    </View>
                  </TouchableOpacity>
                )
              }}
            />
          </View>
        </View>
      </Modal>

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

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
      <Text style={{ fontSize: FontSize.sm, color: Colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: FontSize.sm, color: Colors.gray[900], fontWeight: FontWeight.medium }}>{value}</Text>
    </View>
  )
}

const fieldStyles = StyleSheet.create({
  wrap:  { marginBottom: Spacing.lg },
  label: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs },
})

const styles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: Colors.gray[50] },
  content:             { padding: Spacing.lg, paddingBottom: Spacing['4xl'] },
  centered:            { flex: 1, justifyContent: 'center', alignItems: 'center' },
  screenTitle:         { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: Spacing['2xl'] },
  stepHint:            { fontSize: FontSize.sm, color: Colors.gray[500], marginBottom: Spacing['2xl'] },

  // Step indicator
  stepRow:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing['2xl'] },
  stepItem:            { alignItems: 'center', flex: 1 },
  stepDot:             { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stepDotActive:       { backgroundColor: Colors.brand[600] },
  stepDotDone:         { backgroundColor: Colors.brand[500] },
  stepDotText:         { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.gray[400] },
  stepDotTextActive:   { color: Colors.white },
  stepLabel:           { fontSize: FontSize.xs, color: Colors.gray[400] },
  stepLabelActive:     { color: Colors.gray[900], fontWeight: FontWeight.semibold },

  // Fields
  input:               { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: FontSize.base, color: Colors.gray[900], backgroundColor: Colors.white },
  inputMulti:          { height: 96, textAlignVertical: 'top' },
  coverPicker:         { borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.gray[200], borderStyle: 'dashed' },
  coverPreview:        { width: '100%', height: 160, borderRadius: Radius.lg },
  coverPlaceholder:    { height: 100, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.gray[50] },
  coverPlaceholderText:{ fontSize: FontSize.sm, color: Colors.gray[400] },
  chipRow:             { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip:                { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.gray[200], marginBottom: Spacing.xs, backgroundColor: Colors.white },
  chipActive:          { borderColor: Colors.brand[500], backgroundColor: Colors.brand[50] },
  chipText:            { fontSize: FontSize.sm, color: Colors.gray[600] },
  chipTextActive:      { color: Colors.brand[600], fontWeight: FontWeight.semibold },
  datePicker:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, backgroundColor: Colors.white },
  datePickerText:      { fontSize: FontSize.base, color: Colors.gray[900], flex: 1 },
  datePickerPlaceholder: { color: Colors.gray[400] },
  datePickerIcon:      { fontSize: 18, marginLeft: Spacing.sm },
  dateClear:           { fontSize: FontSize.sm, color: Colors.gray[400], paddingLeft: Spacing.sm },
  switchRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.white, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.gray[200] },
  switchLabel:         { fontSize: FontSize.base, color: Colors.gray[800] },

  // Ticket card
  ticketCard:          { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.gray[200] },
  ticketCardHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  ticketCardTitle:     { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[700] },
  removeText:          { fontSize: FontSize.sm, color: Colors.red.DEFAULT },

  // Add type button
  addTypeBtn:          { alignItems: 'center', paddingVertical: Spacing.md, marginBottom: Spacing.lg },
  addTypeBtnText:      { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.semibold },

  // Review
  reviewCard:          { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.gray[200] },
  reviewSectionTitle:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.md },
  reviewTicketRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  reviewTicketName:    { fontSize: FontSize.sm, color: Colors.gray[900], fontWeight: FontWeight.medium },
  reviewTicketPrice:   { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.semibold },

  // Buttons
  saveBtn:             { backgroundColor: Colors.brand[500], borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, alignItems: 'center', ...Shadow.card },
  saveBtnDisabled:     { backgroundColor: Colors.gray[300] },
  saveBtnText:         { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.base },
  draftBtn:            { backgroundColor: Colors.white, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.brand[300] },
  draftBtnText:        { color: Colors.brand[600], fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  btnRow:              { flexDirection: 'row', gap: Spacing.md },
  backBtn:             { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md + 2, alignItems: 'center', justifyContent: 'center' },
  backBtnText:         { fontSize: FontSize.sm, color: Colors.gray[500] },

  // Error
  errorBox:            { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg },
  errorText:           { fontSize: FontSize.sm, color: '#b91c1c' },

  // Template
  saveTemplateText:    { fontSize: FontSize.xs, color: Colors.brand[500], fontWeight: FontWeight.semibold },
  templatePickerBtn:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.brand[300], borderRadius: Radius.lg, paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg, backgroundColor: Colors.brand[50] },
  templatePickerBtnText: { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.semibold },
  templateSectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },

  // Template modal
  modalOverlay:        { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet:          { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 32 },
  modalHeader:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  modalTitle:          { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  modalClose:          { fontSize: 18, color: Colors.gray[500], padding: 4 },
  templateRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
  templateName:        { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  templateMeta:        { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },
  templateAdd:         { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.brand[600] },
  templateDeleteText:  { fontSize: 16 },
})
