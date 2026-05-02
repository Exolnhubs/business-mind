# Mobile Ticket Management + Hot Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the web ticket-type CRUD page to mobile organizer edit flow, and add time-limited hot offer fields (promotional price + expiry) to the ticket edition widget on both web and mobile.

**Architecture:** A DB migration adds 3 columns to `ticket_types`. A new mobile screen `rawaq-mobile/app/organizer/ticket-types.tsx` mirrors the web's `/ticket-types` page and is reachable from the event edit form via a nav row that replaces the legacy price toggle. Both web and mobile forms gain a Hot Offer section. The web GET endpoint gains an `?organizer=1` param to return inactive tickets for organizer management.

**Tech Stack:** React Native / Expo Router (mobile), Next.js App Router (web), Supabase (Postgres), Zod (API validation), `@react-native-community/datetimepicker` (mobile date pickers)

---

## File Map

| Action | Path |
|---|---|
| **Create** | `rawaq-web/supabase/migrations/00069_ticket_hot_offer.sql` |
| **Modify** | `rawaq-web/types/database.ts` — add hot offer fields to `TicketType` |
| **Modify** | `rawaq-mobile/types/database.ts` — add hot offer fields to `TicketType` |
| **Modify** | `rawaq-web/app/api/events/[id]/ticket-types/route.ts` — GET organizer param + POST schema |
| **Modify** | `rawaq-web/app/api/events/[id]/ticket-types/[typeId]/route.ts` — PATCH schema |
| **Modify** | `rawaq-web/app/(app)/organizer/events/[id]/ticket-types/page.tsx` — hot offer UI, fetch all |
| **Create** | `rawaq-mobile/app/organizer/ticket-types.tsx` — full CRUD screen |
| **Modify** | `rawaq-mobile/app/organizer/event-form.tsx` — replace price toggle with nav row |

---

## Task 1: DB Migration

**Files:**
- Create: `rawaq-web/supabase/migrations/00069_ticket_hot_offer.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 00069_ticket_hot_offer.sql
ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS is_hot_offer      BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hot_offer_price   NUMERIC(10,2) CHECK (hot_offer_price >= 0),
  ADD COLUMN IF NOT EXISTS hot_offer_ends_at TIMESTAMPTZ;

ALTER TABLE ticket_types
  ADD CONSTRAINT chk_hot_offer_fields
    CHECK (
      NOT is_hot_offer
      OR (hot_offer_price IS NOT NULL AND hot_offer_ends_at IS NOT NULL)
    );

COMMENT ON COLUMN ticket_types.is_hot_offer      IS 'When true, display hot_offer_price as the effective price until hot_offer_ends_at.';
COMMENT ON COLUMN ticket_types.hot_offer_price   IS 'Promotional price shown while hot offer is active. NULL when is_hot_offer = false.';
COMMENT ON COLUMN ticket_types.hot_offer_ends_at IS 'When this timestamp passes, the offer expires and price reverts to the base price column.';
```

- [ ] **Step 2: Apply migration to local Supabase**

```bash
cd rawaq-web
npx supabase db push
```

Expected: migration applies without error. Verify with:
```bash
npx supabase db diff
```
Expected: empty diff (migration is applied).

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/supabase/migrations/00069_ticket_hot_offer.sql
git commit -m "feat(db): add hot offer fields to ticket_types"
```

---

## Task 2: Update TypeScript Types (Both Clients)

**Files:**
- Modify: `rawaq-web/types/database.ts`
- Modify: `rawaq-mobile/types/database.ts`

- [ ] **Step 1: Add hot offer fields to web TicketType**

In `rawaq-web/types/database.ts`, find the `TicketType` interface (around line 317) and add the three new fields:

```typescript
export interface TicketType {
  id: string
  event_id: string
  name: string
  name_ar: string | null
  description: string | null
  price: number
  capacity: number | null
  sold_count: number
  is_free: boolean
  sale_starts_at: string | null
  sale_ends_at: string | null
  sort_order: number
  is_active: boolean
  is_hot_offer: boolean          // ← add
  hot_offer_price: number | null // ← add
  hot_offer_ends_at: string | null // ← add
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Add hot offer fields to mobile TicketType**

In `rawaq-mobile/types/database.ts`, find the `TicketType` interface and apply the same three additions:

```typescript
is_hot_offer: boolean
hot_offer_price: number | null
hot_offer_ends_at: string | null
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/types/database.ts rawaq-mobile/types/database.ts
git commit -m "feat(types): add hot_offer fields to TicketType"
```

---

## Task 3: Update Web API GET Route (Organizer Param)

**Files:**
- Modify: `rawaq-web/app/api/events/[id]/ticket-types/route.ts`

- [ ] **Step 1: Add organizer query param support to GET**

Replace the GET handler so that `?organizer=1` skips the `is_active` filter after verifying ownership:

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, NotFoundException, ForbiddenException } from '@/lib/errors'

const TicketTypeSchema = z.object({
  name:              z.string().min(1).max(100),
  name_ar:           z.string().max(100).optional().nullable(),
  description:       z.string().max(500).optional().nullable(),
  price:             z.number().min(0),
  capacity:          z.number().int().positive().optional().nullable(),
  is_free:           z.boolean().default(false),
  sale_starts_at:    z.string().datetime().optional().nullable(),
  sale_ends_at:      z.string().datetime().optional().nullable(),
  sort_order:        z.number().int().default(0),
  is_hot_offer:      z.boolean().default(false),
  hot_offer_price:   z.number().min(0).optional().nullable(),
  hot_offer_ends_at: z.string().datetime().optional().nullable(),
})

// GET /api/events/[id]/ticket-types
// Public: returns active tickets only.
// Organizer: add ?organizer=1 to get all tickets (including inactive). Requires auth + ownership.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const isOrganizerView = req.nextUrl.searchParams.get('organizer') === '1'
    const supabase = await createSupabaseServerClient()

    if (isOrganizerView) {
      const ctx = await requireAuth()
      const { data: event } = await supabase
        .from('events').select('organizer_id').eq('id', eventId).single()
      if (!event) throw new NotFoundException('Event')
      if (event.organizer_id !== ctx.userId && ctx.role !== 'admin') {
        throw new ForbiddenException('Not your event')
      }

      const { data, error } = await supabase
        .from('ticket_types')
        .select('*')
        .eq('event_id', eventId)
        .order('sort_order')
      if (error) throw error
      return ok(data ?? [])
    }

    const { data, error } = await supabase
      .from('ticket_types')
      .select('*')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('sort_order')
    if (error) throw error
    return ok(data ?? [])
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/events/[id]/ticket-types — organizer only
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth()
    const { id: eventId } = await params
    const supabase = await createSupabaseServerClient()

    const { data: event } = await supabase
      .from('events').select('id, organizer_id').eq('id', eventId).single()
    if (!event) throw new NotFoundException('Event')
    if (event.organizer_id !== ctx.userId && ctx.role !== 'admin') {
      throw new ForbiddenException('Not your event')
    }

    const body  = await req.json()
    const input = TicketTypeSchema.parse(body)

    const { data, error } = await supabase
      .from('ticket_types')
      .insert({ ...input, event_id: eventId } as any)
      .select()
      .single()
    if (error) throw error
    return created(data)
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add "rawaq-web/app/api/events/[id]/ticket-types/route.ts"
git commit -m "feat(api): add organizer GET param and hot offer fields to ticket-types route"
```

---

## Task 4: Update Web API PATCH Schema

**Files:**
- Modify: `rawaq-web/app/api/events/[id]/ticket-types/[typeId]/route.ts`

- [ ] **Step 1: Extend UpdateTicketTypeSchema with hot offer fields**

Replace `UpdateTicketTypeSchema`:

```typescript
const UpdateTicketTypeSchema = z.object({
  name:              z.string().min(1).max(100).optional(),
  name_ar:           z.string().max(100).optional().nullable(),
  description:       z.string().max(500).optional().nullable(),
  price:             z.number().min(0).optional(),
  capacity:          z.number().int().positive().optional().nullable(),
  is_free:           z.boolean().optional(),
  sale_starts_at:    z.string().datetime().optional().nullable(),
  sale_ends_at:      z.string().datetime().optional().nullable(),
  sort_order:        z.number().int().optional(),
  is_active:         z.boolean().optional(),
  is_hot_offer:      z.boolean().optional(),
  hot_offer_price:   z.number().min(0).optional().nullable(),
  hot_offer_ends_at: z.string().datetime().optional().nullable(),
})
```

No other changes needed — the PATCH handler already does `.update(input)` which will include the new fields automatically.

- [ ] **Step 2: Commit**

```bash
git add "rawaq-web/app/api/events/[id]/ticket-types/[typeId]/route.ts"
git commit -m "feat(api): add hot offer fields to PATCH schema"
```

---

## Task 5: Update Web Ticket-Types Page (Hot Offer UI)

**Files:**
- Modify: `rawaq-web/app/(app)/organizer/events/[id]/ticket-types/page.tsx`

- [ ] **Step 1: Add hot offer fields to EMPTY_FORM and fetch all tickets**

Replace the `EMPTY_FORM` constant and `load` function:

```typescript
const EMPTY_FORM = {
  name: '',
  name_ar: '',
  description: '',
  price: 0,
  capacity: '',
  is_free: false,
  sale_starts_at: '',
  sale_ends_at: '',
  sort_order: 0,
  is_hot_offer: false,
  hot_offer_price: 0,
  hot_offer_ends_at: '',
}

function load() {
  Promise.all([
    fetch(`/api/events/${eventId}/ticket-types?organizer=1`).then((r) => r.json()),
    fetch(`/api/events/${eventId}`).then((r) => r.json()).catch(() => null),
  ])
    .then(([ticketJson, eventJson]) => {
      setTypes(ticketJson.data ?? ticketJson ?? [])
      setEventCurrency(eventJson?.data?.currency ?? 'SAR')
      setLoading(false)
    })
    .catch(() => setLoading(false))
}
```

- [ ] **Step 2: Add hot offer fields to openEdit**

Replace the `openEdit` function:

```typescript
function openEdit(t: TicketType) {
  setEditing(t)
  setForm({
    name:              t.name,
    name_ar:           t.name_ar ?? '',
    description:       t.description ?? '',
    price:             t.price,
    capacity:          t.capacity?.toString() ?? '',
    is_free:           t.is_free,
    sale_starts_at:    t.sale_starts_at ? t.sale_starts_at.slice(0, 16) : '',
    sale_ends_at:      t.sale_ends_at   ? t.sale_ends_at.slice(0, 16)   : '',
    sort_order:        t.sort_order,
    is_hot_offer:      t.is_hot_offer,
    hot_offer_price:   t.hot_offer_price ?? 0,
    hot_offer_ends_at: t.hot_offer_ends_at ? t.hot_offer_ends_at.slice(0, 16) : '',
  })
  setError('')
  setShowForm(true)
}
```

- [ ] **Step 3: Update submit to include hot offer payload**

Replace the `payload` object inside `submit()`:

```typescript
const payload = {
  name:              form.name.trim(),
  name_ar:           form.name_ar.trim() || null,
  description:       form.description.trim() || null,
  price:             form.is_free ? 0 : Number(form.price),
  capacity:          form.capacity ? Number(form.capacity) : null,
  is_free:           form.is_free,
  sale_starts_at:    form.sale_starts_at ? new Date(form.sale_starts_at).toISOString() : null,
  sale_ends_at:      form.sale_ends_at   ? new Date(form.sale_ends_at).toISOString()   : null,
  sort_order:        Number(form.sort_order),
  is_hot_offer:      form.is_hot_offer,
  hot_offer_price:   form.is_hot_offer ? Number(form.hot_offer_price) : null,
  hot_offer_ends_at: form.is_hot_offer && form.hot_offer_ends_at
    ? new Date(form.hot_offer_ends_at).toISOString()
    : null,
}
```

- [ ] **Step 4: Add Hot Offer section to the form JSX**

After the sort order row (closing `</div>` of the 2-column grid), add:

```tsx
<div className="col-span-2 border-t pt-3 mt-1">
  <label className="flex items-center gap-2 cursor-pointer mb-3">
    <input
      type="checkbox"
      checked={form.is_hot_offer}
      onChange={(e) => setForm((f) => ({
        ...f,
        is_hot_offer: e.target.checked,
        hot_offer_price: e.target.checked ? f.hot_offer_price : 0,
        hot_offer_ends_at: e.target.checked ? f.hot_offer_ends_at : '',
      }))}
      className="w-4 h-4 accent-brand-500"
    />
    <span className="text-sm font-semibold text-gray-700">🔥 Hot Offer</span>
  </label>

  {form.is_hot_offer && (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="form-label">Hot offer price ({eventCurrency})</label>
        <input
          className="input"
          type="number"
          min={0}
          step={0.01}
          value={form.hot_offer_price}
          onChange={(e) => setForm((f) => ({ ...f, hot_offer_price: Number(e.target.value) }))}
        />
      </div>
      <div>
        <label className="form-label">Offer ends at</label>
        <input
          className="input"
          type="datetime-local"
          value={form.hot_offer_ends_at}
          onChange={(e) => setForm((f) => ({ ...f, hot_offer_ends_at: e.target.value }))}
        />
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 5: Update submit validation to require hot offer fields when toggled**

Add before `setError('')` in `submit()`:

```typescript
if (form.is_hot_offer) {
  if (!form.hot_offer_price || Number(form.hot_offer_price) <= 0) {
    setError('Hot offer price is required'); return
  }
  if (!form.hot_offer_ends_at) {
    setError('Offer end date is required'); return
  }
  if (new Date(form.hot_offer_ends_at) <= new Date()) {
    setError('Offer end date must be in the future'); return
  }
}
```

- [ ] **Step 6: Update list items to show hot offer badge and pricing**

Replace the price display inside the `types.map((t) => ...)` render:

```tsx
<div className="flex gap-3 mt-0.5 text-xs text-gray-500">
  {(() => {
    const hotActive = t.is_hot_offer && t.hot_offer_ends_at && new Date(t.hot_offer_ends_at) > new Date()
    const hotExpired = t.is_hot_offer && t.hot_offer_ends_at && new Date(t.hot_offer_ends_at) <= new Date()
    return (
      <>
        {hotActive ? (
          <span className="flex items-center gap-1">
            <span className="line-through text-gray-400">{t.is_free ? 'Free' : formatCurrency(t.price, eventCurrency)}</span>
            <span className="font-semibold text-orange-600">🔥 {formatCurrency(t.hot_offer_price!, eventCurrency)}</span>
            <span className="text-gray-400">until {new Date(t.hot_offer_ends_at!).toLocaleDateString()}</span>
          </span>
        ) : (
          <span className="font-medium text-brand-700">{t.is_free ? 'Free' : formatCurrency(t.price, eventCurrency)}</span>
        )}
        {hotExpired && <span className="text-xs bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded-full">Offer expired</span>}
        {t.capacity && <span>{t.sold_count}/{t.capacity} sold</span>}
        {!t.capacity && t.sold_count > 0 && <span>{t.sold_count} sold</span>}
        {t.sale_ends_at && !hotActive && <span>Ends {new Date(t.sale_ends_at).toLocaleDateString()}</span>}
      </>
    )
  })()}
</div>
```

- [ ] **Step 7: Commit**

```bash
git add "rawaq-web/app/(app)/organizer/events/[id]/ticket-types/page.tsx"
git commit -m "feat(web): add hot offer section and all-tickets fetch to ticket-types page"
```

---

## Task 6: Create Mobile Ticket-Types Screen

**Files:**
- Create: `rawaq-mobile/app/organizer/ticket-types.tsx`

- [ ] **Step 1: Create the screen file**

```typescript
import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Switch,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import { formatCurrency } from '@/lib/utils'
import type { TicketType } from '@/types/database'

// ─── Types ──────────────────────────────────────────────────────────────────
type PickerTarget = 'sale_starts_at' | 'sale_ends_at' | 'hot_offer_ends_at'

const EMPTY_FORM = {
  name:              '',
  name_ar:           '',
  description:       '',
  price:             '',
  capacity:          '',
  is_free:           false,
  sale_starts_at:    '',
  sale_ends_at:      '',
  sort_order:        '0',
  is_hot_offer:      false,
  hot_offer_price:   '',
  hot_offer_ends_at: '',
}

type FormState = typeof EMPTY_FORM

function formatIsoDisplay(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function TicketTypesScreen() {
  const { eventId, title: eventTitle, currency: eventCurrency = 'SAR' } =
    useLocalSearchParams<{ eventId: string; title: string; currency: string }>()
  const router = useRouter()

  const [types,      setTypes]      = useState<TicketType[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [showForm,   setShowForm]   = useState(false)
  const [editing,    setEditing]    = useState<TicketType | null>(null)
  const [form,       setForm]       = useState<FormState>({ ...EMPTY_FORM })

  // Date picker state
  const [pickerTarget,   setPickerTarget]   = useState<PickerTarget | null>(null)
  const [pickerMode,     setPickerMode]     = useState<'date' | 'time'>('date')
  const [pickerTempDate, setPickerTempDate] = useState(new Date())

  async function load() {
    setLoading(true)
    const { data, error: err } = await apiGet<TicketType[]>(
      `/api/events/${eventId}/ticket-types?organizer=1`,
      { skipCache: true },
    )
    setLoading(false)
    if (err) { setError(err); return }
    setTypes(data ?? [])
  }

  useEffect(() => { load() }, [eventId])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setError(null)
    setShowForm(true)
  }

  function openEdit(t: TicketType) {
    setEditing(t)
    setForm({
      name:              t.name,
      name_ar:           t.name_ar ?? '',
      description:       t.description ?? '',
      price:             t.price.toString(),
      capacity:          t.capacity?.toString() ?? '',
      is_free:           t.is_free,
      sale_starts_at:    t.sale_starts_at ?? '',
      sale_ends_at:      t.sale_ends_at ?? '',
      sort_order:        t.sort_order.toString(),
      is_hot_offer:      t.is_hot_offer,
      hot_offer_price:   t.hot_offer_price?.toString() ?? '',
      hot_offer_ends_at: t.hot_offer_ends_at ?? '',
    })
    setError(null)
    setShowForm(true)
  }

  function openPicker(target: PickerTarget) {
    const existing = form[target]
    const date = existing ? new Date(existing) : new Date()
    setPickerTempDate(isNaN(date.getTime()) ? new Date() : date)
    setPickerMode('date')
    setPickerTarget(target)
  }

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'dismissed' || !selected || !pickerTarget) {
      setPickerTarget(null)
      return
    }
    if (pickerMode === 'date') {
      setPickerTempDate(selected)
      setPickerMode('time')
    } else {
      const combined = new Date(pickerTempDate)
      combined.setHours(selected.getHours(), selected.getMinutes(), 0, 0)
      setForm((f) => ({ ...f, [pickerTarget]: combined.toISOString() }))
      setPickerTarget(null)
    }
  }

  async function submit() {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.is_free && (!form.price || Number(form.price) <= 0)) {
      setError('Price is required for paid tickets'); return
    }
    if (form.is_hot_offer) {
      if (!form.hot_offer_price || Number(form.hot_offer_price) <= 0) {
        setError('Hot offer price is required'); return
      }
      if (!form.hot_offer_ends_at) { setError('Offer end date is required'); return }
      if (new Date(form.hot_offer_ends_at) <= new Date()) {
        setError('Offer end date must be in the future'); return
      }
    }
    setError(null)
    setSaving(true)

    const payload: Record<string, unknown> = {
      name:              form.name.trim(),
      name_ar:           form.name_ar.trim() || null,
      description:       form.description.trim() || null,
      price:             form.is_free ? 0 : Number(form.price),
      capacity:          form.capacity ? Number(form.capacity) : null,
      is_free:           form.is_free,
      sale_starts_at:    form.sale_starts_at || null,
      sale_ends_at:      form.sale_ends_at || null,
      sort_order:        Number(form.sort_order),
      is_hot_offer:      form.is_hot_offer,
      hot_offer_price:   form.is_hot_offer ? Number(form.hot_offer_price) : null,
      hot_offer_ends_at: form.is_hot_offer ? (form.hot_offer_ends_at || null) : null,
    }

    const path = editing
      ? `/api/events/${eventId}/ticket-types/${editing.id}`
      : `/api/events/${eventId}/ticket-types`

    const { error: err } = editing
      ? await apiPatch(path, payload)
      : await apiPost(path, payload)

    setSaving(false)
    if (err) { setError(err); return }
    setShowForm(false)
    load()
  }

  async function deleteType(t: TicketType) {
    Alert.alert(
      'Remove ticket type',
      `Remove "${t.name}"? Existing bookings won't be affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await apiDelete(`/api/events/${eventId}/ticket-types/${t.id}`)
            if (err) Alert.alert('Error', err)
            else load()
          },
        },
      ],
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.centered}><ActivityIndicator size="large" color={Colors.brand[500]} /></View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.screenTitle} numberOfLines={1}>{eventTitle ?? 'Ticket Types'}</Text>
          {!showForm && (
            <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Edit/Create Form ── */}
          {showForm && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{editing ? 'Edit Ticket Type' : 'New Ticket Type'}</Text>

              <Field label="Name *">
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                  placeholder="e.g. Early Bird"
                  placeholderTextColor={Colors.gray[400]}
                />
              </Field>

              <Field label="Name (Arabic)">
                <TextInput
                  style={[styles.input, { textAlign: 'right' }]}
                  value={form.name_ar}
                  onChangeText={(v) => setForm((f) => ({ ...f, name_ar: v }))}
                  placeholder="بالعربي"
                  placeholderTextColor={Colors.gray[400]}
                />
              </Field>

              <Field label="Description">
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={form.description}
                  onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                  placeholder="What's included…"
                  placeholderTextColor={Colors.gray[400]}
                  multiline
                  numberOfLines={3}
                />
              </Field>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Free Ticket</Text>
                <Switch
                  value={form.is_free}
                  onValueChange={(v) => setForm((f) => ({ ...f, is_free: v, price: v ? '' : f.price }))}
                  trackColor={{ false: Colors.gray[200], true: Colors.brand[400] }}
                  thumbColor={form.is_free ? Colors.brand[500] : Colors.gray[400]}
                />
              </View>

              {!form.is_free && (
                <Field label={`Price (${eventCurrency})`}>
                  <TextInput
                    style={styles.input}
                    value={form.price}
                    onChangeText={(v) => setForm((f) => ({ ...f, price: v }))}
                    placeholder="0.00"
                    placeholderTextColor={Colors.gray[400]}
                    keyboardType="decimal-pad"
                  />
                </Field>
              )}

              <Field label="Capacity (blank = unlimited)">
                <TextInput
                  style={styles.input}
                  value={form.capacity}
                  onChangeText={(v) => setForm((f) => ({ ...f, capacity: v }))}
                  placeholder="Unlimited"
                  placeholderTextColor={Colors.gray[400]}
                  keyboardType="number-pad"
                />
              </Field>

              <Field label="Sort Order">
                <TextInput
                  style={styles.input}
                  value={form.sort_order}
                  onChangeText={(v) => setForm((f) => ({ ...f, sort_order: v }))}
                  keyboardType="number-pad"
                />
              </Field>

              <Field label="Sale Starts">
                <TouchableOpacity style={styles.datePicker} onPress={() => openPicker('sale_starts_at')}>
                  <Text style={[styles.datePickerText, !form.sale_starts_at && styles.datePickerPlaceholder]}>
                    {form.sale_starts_at ? formatIsoDisplay(form.sale_starts_at) : 'Select date & time'}
                  </Text>
                  {form.sale_starts_at
                    ? <TouchableOpacity onPress={() => setForm((f) => ({ ...f, sale_starts_at: '' }))}><Text style={styles.dateClear}>✕</Text></TouchableOpacity>
                    : <Text style={styles.datePickerIcon}>📅</Text>
                  }
                </TouchableOpacity>
              </Field>

              <Field label="Sale Ends">
                <TouchableOpacity style={styles.datePicker} onPress={() => openPicker('sale_ends_at')}>
                  <Text style={[styles.datePickerText, !form.sale_ends_at && styles.datePickerPlaceholder]}>
                    {form.sale_ends_at ? formatIsoDisplay(form.sale_ends_at) : 'Select date & time'}
                  </Text>
                  {form.sale_ends_at
                    ? <TouchableOpacity onPress={() => setForm((f) => ({ ...f, sale_ends_at: '' }))}><Text style={styles.dateClear}>✕</Text></TouchableOpacity>
                    : <Text style={styles.datePickerIcon}>📅</Text>
                  }
                </TouchableOpacity>
              </Field>

              {/* Hot Offer section */}
              <View style={styles.divider} />
              <View style={[styles.switchRow, { marginBottom: Spacing.md }]}>
                <Text style={styles.switchLabel}>🔥 Hot Offer</Text>
                <Switch
                  value={form.is_hot_offer}
                  onValueChange={(v) => setForm((f) => ({
                    ...f,
                    is_hot_offer: v,
                    hot_offer_price:   v ? f.hot_offer_price : '',
                    hot_offer_ends_at: v ? f.hot_offer_ends_at : '',
                  }))}
                  trackColor={{ false: Colors.gray[200], true: '#fb923c' }}
                  thumbColor={form.is_hot_offer ? '#ea580c' : Colors.gray[400]}
                />
              </View>

              {form.is_hot_offer && (
                <>
                  <Field label={`Hot Offer Price (${eventCurrency})`}>
                    <TextInput
                      style={styles.input}
                      value={form.hot_offer_price}
                      onChangeText={(v) => setForm((f) => ({ ...f, hot_offer_price: v }))}
                      placeholder="0.00"
                      placeholderTextColor={Colors.gray[400]}
                      keyboardType="decimal-pad"
                    />
                  </Field>

                  <Field label="Offer Ends At">
                    <TouchableOpacity style={styles.datePicker} onPress={() => openPicker('hot_offer_ends_at')}>
                      <Text style={[styles.datePickerText, !form.hot_offer_ends_at && styles.datePickerPlaceholder]}>
                        {form.hot_offer_ends_at ? formatIsoDisplay(form.hot_offer_ends_at) : 'Select date & time'}
                      </Text>
                      {form.hot_offer_ends_at
                        ? <TouchableOpacity onPress={() => setForm((f) => ({ ...f, hot_offer_ends_at: '' }))}><Text style={styles.dateClear}>✕</Text></TouchableOpacity>
                        : <Text style={styles.datePickerIcon}>📅</Text>
                      }
                    </TouchableOpacity>
                  </Field>
                </>
              )}

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={submit}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color={Colors.white} />
                    : <Text style={styles.saveBtnText}>{editing ? 'Update' : 'Create'}</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowForm(false); setError(null) }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Ticket List ── */}
          {!showForm && types.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No ticket types yet. Tap + Add to create one.</Text>
            </View>
          )}

          {!showForm && types.map((t) => {
            const hotActive  = t.is_hot_offer && !!t.hot_offer_ends_at && new Date(t.hot_offer_ends_at) > new Date()
            const hotExpired = t.is_hot_offer && !!t.hot_offer_ends_at && new Date(t.hot_offer_ends_at) <= new Date()
            const soldOut    = t.capacity !== null && t.sold_count >= t.capacity

            return (
              <View key={t.id} style={[styles.ticketRow, !t.is_active && styles.ticketRowInactive]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.ticketBadgeRow}>
                    <Text style={styles.ticketName}>{t.name}</Text>
                    {!t.is_active && <Text style={styles.badgeInactive}>Inactive</Text>}
                    {soldOut && <Text style={styles.badgeSoldOut}>Sold out</Text>}
                    {hotActive && <Text style={styles.badgeHot}>🔥 Hot</Text>}
                    {hotExpired && <Text style={styles.badgeExpired}>Offer expired</Text>}
                  </View>

                  <View style={styles.ticketMeta}>
                    {hotActive ? (
                      <>
                        <Text style={styles.ticketPriceStrike}>
                          {t.is_free ? 'Free' : formatCurrency(t.price, eventCurrency)}
                        </Text>
                        <Text style={styles.ticketHotPrice}>
                          {formatCurrency(t.hot_offer_price!, eventCurrency)}
                        </Text>
                        <Text style={styles.ticketMetaText}>
                          until {new Date(t.hot_offer_ends_at!).toLocaleDateString()}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.ticketPrice}>
                        {t.is_free ? 'Free' : formatCurrency(t.price, eventCurrency)}
                      </Text>
                    )}
                    {t.capacity != null && (
                      <Text style={styles.ticketMetaText}>{t.sold_count}/{t.capacity} sold</Text>
                    )}
                    {t.capacity == null && t.sold_count > 0 && (
                      <Text style={styles.ticketMetaText}>{t.sold_count} sold</Text>
                    )}
                  </View>
                </View>

                <View style={styles.ticketActions}>
                  <TouchableOpacity onPress={() => openEdit(t)}>
                    <Text style={styles.actionEdit}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteType(t)}>
                    <Text style={styles.actionDelete}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          })}

          {/* Date picker */}
          {pickerTarget !== null && (
            <DateTimePicker
              value={pickerTempDate}
              mode={pickerMode}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={pickerTarget !== 'sale_starts_at' ? new Date() : undefined}
              onChange={onPickerChange}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─── Helper component ────────────────────────────────────────────────────────
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

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea:            { flex: 1, backgroundColor: Colors.gray[50] },
  container:           { flex: 1 },
  content:             { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: 60 },
  centered:            { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.gray[50], gap: Spacing.sm },
  backBtn:             { paddingRight: Spacing.sm },
  backBtnText:         { fontSize: FontSize.sm, color: Colors.brand[600] },
  screenTitle:         { flex: 1, fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  addBtn:              { backgroundColor: Colors.brand[500], paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full },
  addBtnText:          { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.white },

  card:                { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.gray[200], ...Shadow.card },
  cardTitle:           { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.gray[900], marginBottom: Spacing.lg },

  input:               { borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: FontSize.base, color: Colors.gray[900], backgroundColor: Colors.white },
  inputMulti:          { height: 80, textAlignVertical: 'top' },
  switchRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.white, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.gray[200], marginBottom: Spacing.lg },
  switchLabel:         { fontSize: FontSize.base, color: Colors.gray[800] },
  datePicker:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, backgroundColor: Colors.white },
  datePickerText:      { fontSize: FontSize.base, color: Colors.gray[900], flex: 1 },
  datePickerPlaceholder: { color: Colors.gray[400] },
  datePickerIcon:      { fontSize: 18, marginLeft: Spacing.sm },
  dateClear:           { fontSize: FontSize.sm, color: Colors.gray[400], paddingLeft: Spacing.sm },
  divider:             { height: 1, backgroundColor: Colors.gray[100], marginVertical: Spacing.md },

  btnRow:              { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  saveBtn:             { flex: 1, backgroundColor: Colors.brand[500], borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center', ...Shadow.card },
  saveBtnDisabled:     { backgroundColor: Colors.gray[300] },
  saveBtnText:         { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.base },
  cancelBtn:           { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, justifyContent: 'center' },
  cancelBtnText:       { fontSize: FontSize.sm, color: Colors.gray[500] },

  errorBox:            { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  errorText:           { fontSize: FontSize.sm, color: '#b91c1c' },

  emptyCard:           { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing['2xl'], alignItems: 'center', borderWidth: 1, borderColor: Colors.gray[200] },
  emptyText:           { fontSize: FontSize.sm, color: Colors.gray[400], textAlign: 'center' },

  ticketRow:           { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.gray[200], flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ticketRowInactive:   { opacity: 0.5 },
  ticketBadgeRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap', marginBottom: 4 },
  ticketName:          { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  ticketMeta:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  ticketPrice:         { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.brand[700] },
  ticketPriceStrike:   { fontSize: FontSize.xs, color: Colors.gray[400], textDecorationLine: 'line-through' },
  ticketHotPrice:      { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#ea580c' },
  ticketMetaText:      { fontSize: FontSize.xs, color: Colors.gray[400] },
  ticketActions:       { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  actionEdit:          { fontSize: FontSize.xs, color: Colors.brand[600], fontWeight: FontWeight.semibold },
  actionDelete:        { fontSize: FontSize.xs, color: Colors.red.DEFAULT },

  badgeInactive:       { fontSize: 10, backgroundColor: Colors.gray[100], color: Colors.gray[500], paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
  badgeSoldOut:        { fontSize: 10, backgroundColor: '#fee2e2', color: '#dc2626', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
  badgeHot:            { fontSize: 10, backgroundColor: '#ffedd5', color: '#ea580c', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
  badgeExpired:        { fontSize: 10, backgroundColor: '#fff7ed', color: '#c2410c', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
})
```

- [ ] **Step 2: Commit**

```bash
git add rawaq-mobile/app/organizer/ticket-types.tsx
git commit -m "feat(mobile): add ticket-types management screen with hot offer support"
```

---

## Task 7: Update Mobile Event-Form Edit Mode

**Files:**
- Modify: `rawaq-mobile/app/organizer/event-form.tsx`

- [ ] **Step 1: Add `apiGet` import change notice**

`apiGet` is already imported. No import changes needed — only `apiPatch` is used in this file and that stays.

- [ ] **Step 2: Replace the edit-mode pricing Field with a nav row**

Find the block (around line 797-808):

```tsx
            {/* Edit mode keeps price field */}
            {isEdit && (
              <Field label="Pricing">
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Free Event</Text>
                  <Switch value={isFree} onValueChange={setIsFree} trackColor={{ false: Colors.gray[200], true: Colors.brand[400] }} thumbColor={isFree ? Colors.brand[500] : Colors.gray[400]} />
                </View>
                {!isFree && (
                  <TextInput style={[styles.input, { marginTop: Spacing.sm }]} value={price} onChangeText={setPrice} placeholder={`Price in ${eventCurrency}`} placeholderTextColor={Colors.gray[400]} keyboardType="decimal-pad" maxLength={8} />
                )}
              </Field>
            )}
```

Replace it with:

```tsx
            {isEdit && (
              <Field label="Ticket Types">
                <TouchableOpacity
                  style={styles.navRow}
                  onPress={() =>
                    router.push(
                      `/organizer/ticket-types?eventId=${id}&title=${encodeURIComponent(title)}&currency=${encodeURIComponent(eventCurrency)}`
                    )
                  }
                >
                  <Text style={styles.navRowText}>Manage Ticket Types</Text>
                  <Text style={styles.navRowArrow}>›</Text>
                </TouchableOpacity>
              </Field>
            )}
```

- [ ] **Step 3: Add navRow styles to the StyleSheet**

In the `styles` StyleSheet at the bottom of the file, add after `helperText`:

```typescript
  navRow:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.white, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.gray[200] },
  navRowText:          { fontSize: FontSize.base, color: Colors.brand[600], fontWeight: FontWeight.semibold },
  navRowArrow:         { fontSize: 20, color: Colors.gray[400] },
```

- [ ] **Step 4: Remove now-unused state variables used only by the old price toggle in edit mode**

Check `isFree`, `price`, `eventCurrency` — these are also used in the create wizard (step 2) so they must remain. No removals needed.

- [ ] **Step 5: Commit**

```bash
git add rawaq-mobile/app/organizer/event-form.tsx
git commit -m "feat(mobile): replace edit-mode price toggle with ticket types nav row"
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ DB migration with 3 columns + CHECK constraint
- ✅ TypeScript types in both clients
- ✅ Web GET route `?organizer=1` with auth guard
- ✅ Web POST schema updated with hot offer fields
- ✅ Web PATCH schema updated with hot offer fields
- ✅ Web ticket-types page: hot offer form section, validation, list display, fetch-all
- ✅ Mobile ticket-types.tsx: full CRUD, all fields, hot offer, date pickers
- ✅ Mobile event-form.tsx: nav row replaces price toggle in edit mode

**Out of scope (documented in spec):** booking flow hot-price display, DB trigger auto-disable.
