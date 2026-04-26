# Happening Participants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "👥 N joined ›" entry point to community happening cards (mobile + web) that opens a participants list (avatar, name, platform signup date) with a hybrid bottom-sheet/modal escalating to a full-screen route when participant count > 15.

**Architecture:** New `GET /api/happenings/:id/participants` endpoint in `rawaq-web` returns paginated profile rows joined to `happening_rsvps` (admin client bypasses RLS). Both clients consume it. Mobile gets a bottom sheet + full-screen route. Web gets a centered modal (using existing `<Modal>` primitive) + full-screen route. Tapping a user navigates to `/user/{id}`.

**Tech Stack:** Next.js App Router (rawaq-web), Expo Router (rawaq-mobile), Supabase, Upstash Ratelimit, TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-26-happening-participants-design.md`

---

## File map

**New:**
- `rawaq-web/app/api/happenings/[id]/participants/route.ts`
- `rawaq-web/components/communities/HappeningParticipantsModal.tsx`
- `rawaq-web/app/(app)/happenings/[id]/participants/page.tsx`
- `rawaq-mobile/components/happenings/HappeningParticipantsSheet.tsx`
- `rawaq-mobile/app/happenings/[id]/participants.tsx`

**Modified:**
- `rawaq-web/lib/rate-limit.ts` (add `happeningParticipants` limiter)
- `rawaq-web/components/communities/HappeningCard.tsx` (row + prop)
- `rawaq-web/app/(app)/communities/[slug]/page.tsx` (modal state + wiring)
- `rawaq-mobile/components/happenings/HappeningDiscoveryCard.tsx` (row + prop)
- `rawaq-mobile/app/(tabs)/happenings.tsx` (sheet state + wiring)

**Notes for the engineer:**
- The `rawaq-web` repo has **no automated test infrastructure for API routes or React components** — verification is via the dev server (`pnpm dev` or `npm run dev` from `rawaq-web`) plus `curl` for the API.
- The `rawaq-mobile` app is verified via Expo (`pnpm start` or `npm run start` from `rawaq-mobile`).
- Frequent commits — one per task is the target.

---

## Task 1: Add rate limiter for participants endpoint

**Files:**
- Modify: `rawaq-web/lib/rate-limit.ts`

- [ ] **Step 1: Add the `happeningParticipants` limiter**

Edit `rawaq-web/lib/rate-limit.ts`. Add a new entry inside the `limiters` object (place it after `happenings`):

```ts
export const limiters = {
  globalIp:               sw(300, '1 m',  'global'),
  bookings:               sw(10,  '1 m',  'bookings'),
  payments:               sw(5,   '1 m',  'payments'),
  chat:                   sw(10,  '1 m',  'chat'),
  comments:               sw(15,  '1 m',  'comments'),
  supportChat:            sw(20,  '1 m',  'support:chat'),
  tips:                   sw(5,   '1 m',  'tips'),
  organizerReq:           sw(3,   '24 h', 'organizer:req'),
  reactions:              sw(30,  '1 m',  'reactions'),
  rsvp:                   sw(20,  '1 m',  'rsvp'),
  communityJoin:          sw(10,  '1 m',  'community:join'),
  happenings:             sw(5,   '1 m',  'happenings'),
  happeningParticipants:  sw(60,  '1 m',  'happening:participants'),
}
```

60 requests/minute is generous for a read endpoint that may be re-fetched as the user navigates between cards.

- [ ] **Step 2: Type-check**

Run from `rawaq-web/`:
```bash
npx tsc --noEmit
```
Expected: passes (no new errors).

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/lib/rate-limit.ts
git commit -m "feat(web): add happeningParticipants rate limiter"
```

---

## Task 2: Create the participants API endpoint

**Files:**
- Create: `rawaq-web/app/api/happenings/[id]/participants/route.ts`

- [ ] **Step 1: Write the route**

Create `rawaq-web/app/api/happenings/[id]/participants/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { limiters, checkRateLimit } from '@/lib/rate-limit'

const DEFAULT_LIMIT = 15
const MAX_LIMIT = 50

type Participant = {
  id: string
  display_name: string
  avatar_url: string | null
  joined_at: string
  platform_joined_at: string
}

// GET /api/happenings/:id/participants — list users who RSVP'd a happening
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx   = await requireAuth()
    await checkRateLimit(limiters.happeningParticipants, ctx.userId)
    const admin = createSupabaseAdminClient()

    const url      = new URL(req.url)
    const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
    const rawOffset = Number(url.searchParams.get('offset') ?? 0)
    const limit  = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT))
    const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0)

    const { data: happening } = await (admin as any)
      .from('happenings')
      .select('id, rsvp_count')
      .eq('id', id)
      .maybeSingle()

    if (!happening) throw new NotFoundException('Happening not found')

    const { data: rows } = await (admin as any)
      .from('happening_rsvps')
      .select('created_at, profile:profiles!user_id(id, display_name, avatar_url, created_at)')
      .eq('happening_id', id)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1)

    const participants: Participant[] = ((rows ?? []) as Array<{
      created_at: string
      profile: { id: string; display_name: string; avatar_url: string | null; created_at: string } | null
    }>)
      .filter((r) => r.profile !== null)
      .map((r) => ({
        id: r.profile!.id,
        display_name: r.profile!.display_name,
        avatar_url: r.profile!.avatar_url,
        joined_at: r.created_at,
        platform_joined_at: r.profile!.created_at,
      }))

    return ok({
      total: (happening as { rsvp_count: number }).rsvp_count ?? 0,
      participants,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: passes.

- [ ] **Step 3: Manual smoke test**

Start dev server in one terminal:
```bash
cd rawaq-web && npm run dev
```

In another terminal, log in via the web UI to mint a session cookie, copy a happening id from the dev DB (`select id from happenings limit 1` in Supabase SQL editor), then:
```bash
curl -i 'http://localhost:3000/api/happenings/<HAPPENING_ID>/participants?limit=5' \
  -H "Cookie: $(echo 'paste_session_cookie_value')"
```
Expected: 200 status, body shape `{ "total": <n>, "participants": [...] }`. If `n` is 0, `participants` is `[]`. If unauth, expect 401. If id is bogus, expect 404.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/happenings/[id]/participants/route.ts
git commit -m "feat(web): add GET /api/happenings/:id/participants endpoint"
```

---

## Task 3: Add the "joined" row to the mobile happening card

**Files:**
- Modify: `rawaq-mobile/components/happenings/HappeningDiscoveryCard.tsx`

- [ ] **Step 1: Add the new prop and tappable row**

In `rawaq-mobile/components/happenings/HappeningDiscoveryCard.tsx`:

a) Update the `Props` type to add `onShowParticipants`:

```ts
type Props = {
  happening: HappeningDiscoveryItem
  variant?: 'rail'
  onToggleRsvp?: (happening: HappeningDiscoveryItem) => void
  onToggleReact?: (happening: HappeningDiscoveryItem) => void
  onOpenComments?: (happening: HappeningDiscoveryItem) => void
  onShowParticipants?: (happening: HappeningDiscoveryItem) => void
}
```

b) Destructure `onShowParticipants` in the component signature.

c) Inside the `footer` `<View>`, **above** the existing `actions` row (which contains Chat/Join/Like buttons), insert:

```tsx
<TouchableOpacity
  onPress={(e) => {
    e.stopPropagation()
    if (happening.rsvp_count > 0) onShowParticipants?.(happening)
  }}
  activeOpacity={0.7}
  disabled={happening.rsvp_count === 0}
  style={styles.participantsRow}
>
  <Ionicons name="people-outline" size={13} color={Colors.gray[600]} />
  <Text style={styles.participantsText}>
    {happening.rsvp_count > 0 ? `${happening.rsvp_count} joined` : 'No one joined yet'}
  </Text>
  {happening.rsvp_count > 0 && (
    <Ionicons name="chevron-forward" size={12} color={Colors.gray[500]} />
  )}
</TouchableOpacity>
```

d) Add the corresponding styles inside the `StyleSheet.create({ ... })` call:

```ts
participantsRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  marginBottom: Spacing.sm,
},
participantsText: {
  flex: 1,
  fontSize: 11,
  color: Colors.gray[600],
  fontWeight: FontWeight.medium,
},
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-mobile && npx tsc --noEmit
```
Expected: passes (the new prop is optional, so nothing else breaks yet).

- [ ] **Step 3: Manual smoke**

Run Expo (`cd rawaq-mobile && npm run start`), open the Happenings tab, confirm:
- Cards with `rsvp_count > 0` show "👥 N joined ›".
- Cards with `rsvp_count == 0` show "No one joined yet" (non-tappable, no chevron).
- Tapping the row does nothing yet (handler not wired) — that's expected; the next tasks add behavior.
- Tapping the row does **not** also navigate to the community (event propagation stopped).

- [ ] **Step 4: Commit**

```bash
git add rawaq-mobile/components/happenings/HappeningDiscoveryCard.tsx
git commit -m "feat(mobile): add participants row to happening discovery card"
```

---

## Task 4: Build the mobile participants sheet

**Files:**
- Create: `rawaq-mobile/components/happenings/HappeningParticipantsSheet.tsx`

- [ ] **Step 1: Write the sheet component**

Create `rawaq-mobile/components/happenings/HappeningParticipantsSheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { apiGet } from '@/lib/api'
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/theme'
import { formatDate } from '@/lib/utils'

type Participant = {
  id: string
  display_name: string
  avatar_url: string | null
  joined_at: string
  platform_joined_at: string
}

type ParticipantsResponse = {
  total: number
  participants: Participant[]
}

type Props = {
  visible: boolean
  happeningId: string | null
  onClose: () => void
}

const PAGE_SIZE = 15

export function HappeningParticipantsSheet({ visible, happeningId, onClose }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [participants, setParticipants] = useState<Participant[]>([])

  useEffect(() => {
    if (!visible || !happeningId) return
    let active = true
    const id = happeningId

    async function load() {
      setLoading(true)
      const { data } = await apiGet<ParticipantsResponse>(
        `/api/happenings/${id}/participants?limit=${PAGE_SIZE}`,
      )
      if (!active) return
      setTotal(data?.total ?? 0)
      setParticipants(data?.participants ?? [])
      setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [visible, happeningId])

  function openProfile(userId: string) {
    onClose()
    router.push(`/user/${userId}` as any)
  }

  function viewAll() {
    if (!happeningId) return
    onClose()
    router.push(`/happenings/${happeningId}/participants` as any)
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Participants</Text>
              <Text style={styles.subtitle}>{total} joined</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={18} color={Colors.gray[600]} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={Colors.brand[500]} />
            </View>
          ) : participants.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>No one has joined yet.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              {participants.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.row}
                  activeOpacity={0.7}
                  onPress={() => openProfile(p.id)}
                >
                  <View style={styles.avatar}>
                    {p.avatar_url ? (
                      <Image source={{ uri: p.avatar_url }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarFallback}>
                        {p.display_name.slice(0, 1).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{p.display_name}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      Joined Rawaq · {formatDate(p.platform_joined_at)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={Colors.gray[400]} />
                </TouchableOpacity>
              ))}

              {total > PAGE_SIZE && (
                <TouchableOpacity onPress={viewAll} style={styles.viewAll}>
                  <Text style={styles.viewAllText}>
                    View all {total} participants
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.brand[600]} />
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    maxHeight: '80%',
    ...Shadow.card,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[300],
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  subtitle: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
  closeButton: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.gray[100],
    alignItems: 'center', justifyContent: 'center',
  },
  center: { padding: Spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: FontSize.sm, color: Colors.gray[500] },
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.brand[100],
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 40, height: 40 },
  avatarFallback: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  name: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  meta: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.md,
  },
  viewAllText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.brand[600] },
})
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-mobile && npx tsc --noEmit
```
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add rawaq-mobile/components/happenings/HappeningParticipantsSheet.tsx
git commit -m "feat(mobile): add HappeningParticipantsSheet"
```

---

## Task 5: Wire the sheet into the mobile happenings tab

**Files:**
- Modify: `rawaq-mobile/app/(tabs)/happenings.tsx`

- [ ] **Step 1: Import the sheet and add state**

In `rawaq-mobile/app/(tabs)/happenings.tsx`:

a) Add the import at the top, alongside the existing happenings imports:

```ts
import { HappeningParticipantsSheet } from '@/components/happenings/HappeningParticipantsSheet'
```

b) Add a new state hook next to `selectedHappening`:

```ts
const [selectedParticipants, setSelectedParticipants] = useState<HappeningDiscoveryItem | null>(null)
```

c) Pass `onShowParticipants` to the existing `HappeningDiscoveryCard` (currently at the `renderItem` block):

```tsx
renderItem={({ item }) => (
  <View style={styles.cardWrap}>
    <HappeningDiscoveryCard
      happening={item}
      onToggleRsvp={toggleRsvp}
      onToggleReact={toggleReact}
      onOpenComments={setSelectedHappening}
      onShowParticipants={setSelectedParticipants}
    />
  </View>
)}
```

d) Render the sheet alongside the existing comments sheet (after `<HappeningCommentsSheet ... />`):

```tsx
<HappeningParticipantsSheet
  visible={!!selectedParticipants}
  happeningId={selectedParticipants?.id ?? null}
  onClose={() => setSelectedParticipants(null)}
/>
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-mobile && npx tsc --noEmit
```
Expected: passes.

- [ ] **Step 3: Manual smoke**

Run Expo, open Happenings tab, tap "👥 N joined ›" on a card with at least 1 RSVP. Expected:
- Sheet slides up.
- Header shows "Participants" and "{N} joined".
- List shows up to 15 rows; each row has avatar, name, "Joined Rawaq · <date>".
- Tap a row → navigates to `/user/{id}`, sheet closes.
- If RSVP count > 15, footer shows "View all N participants" link (test by manually inserting RSVPs in Supabase or by mocking — leave as known limit if unable).
- Tap the X / scrim → sheet closes.

- [ ] **Step 4: Commit**

```bash
git add rawaq-mobile/app/(tabs)/happenings.tsx
git commit -m "feat(mobile): wire participants sheet into happenings tab"
```

---

## Task 6: Build the mobile full-screen participants route

**Files:**
- Create: `rawaq-mobile/app/happenings/[id]/participants.tsx`

- [ ] **Step 1: Write the route**

Create `rawaq-mobile/app/happenings/[id]/participants.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { apiGet } from '@/lib/api'
import { Colors, FontSize, FontWeight, Spacing } from '@/theme'
import { formatDate } from '@/lib/utils'

type Participant = {
  id: string
  display_name: string
  avatar_url: string | null
  joined_at: string
  platform_joined_at: string
}

type ParticipantsResponse = {
  total: number
  participants: Participant[]
}

const PAGE_SIZE = 15

export default function HappeningParticipantsScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadPage = useCallback(async (offset: number, replace: boolean) => {
    if (!id) return
    if (replace) setLoading(true)
    else setLoadingMore(true)
    const { data } = await apiGet<ParticipantsResponse>(
      `/api/happenings/${id}/participants?limit=${PAGE_SIZE}&offset=${offset}`,
      { force: replace },
    )
    setTotal(data?.total ?? 0)
    setParticipants((prev) => (replace ? (data?.participants ?? []) : [...prev, ...(data?.participants ?? [])]))
    setLoading(false)
    setLoadingMore(false)
    setRefreshing(false)
  }, [id])

  useEffect(() => {
    void loadPage(0, true)
  }, [loadPage])

  function onEndReached() {
    if (loadingMore || loading || participants.length >= total) return
    void loadPage(participants.length, false)
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Participants' }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.brand[500]} />
        </View>
      ) : (
        <FlatList
          data={participants}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                void loadPage(0, true)
              }}
              tintColor={Colors.brand[500]}
            />
          }
          ListHeaderComponent={
            <Text style={styles.header}>{total} joined</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push(`/user/${item.id}` as any)}
            >
              <View style={styles.avatar}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarFallback}>
                    {item.display_name.slice(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.display_name}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  Joined Rawaq · {formatDate(item.platform_joined_at)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={Colors.gray[400]} />
            </TouchableOpacity>
          )}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: Spacing.md }}>
                <ActivityIndicator color={Colors.brand[500]} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No one has joined yet.</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSize.sm, color: Colors.gray[500] },
  list: { padding: Spacing.lg, paddingBottom: Spacing['5xl'] },
  header: { fontSize: FontSize.xs, color: Colors.gray[500], marginBottom: Spacing.md, textTransform: 'uppercase', fontWeight: FontWeight.bold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.brand[100],
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 40, height: 40 },
  avatarFallback: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  name: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  meta: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
})
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-mobile && npx tsc --noEmit
```
Expected: passes.

- [ ] **Step 3: Manual smoke**

Run Expo, open Happenings, tap "👥 N joined ›", tap "View all N participants" inside the sheet (only available when total > 15). Expected:
- Navigates to `/happenings/<id>/participants`.
- Header bar shows "Participants".
- Scrolling near the bottom triggers pagination until `participants.length >= total`.
- Pull-to-refresh resets to first page.
- Tap a row → user profile.

If you cannot easily produce > 15 RSVPs, you can also reach this route by typing `router.push('/happenings/<id>/participants')` from a debug menu, or by temporarily lowering the threshold check in the sheet's `total > PAGE_SIZE` to `total > 0` — revert that change before committing.

- [ ] **Step 4: Commit**

```bash
git add rawaq-mobile/app/happenings/[id]/participants.tsx
git commit -m "feat(mobile): add full-screen happening participants route"
```

---

## Task 7: Add the "joined" row to the web happening card

**Files:**
- Modify: `rawaq-web/components/communities/HappeningCard.tsx`

- [ ] **Step 1: Add the new prop and tappable row**

In `rawaq-web/components/communities/HappeningCard.tsx`:

a) Update the `Props` interface:

```ts
interface Props {
  happening: HappeningWithAuthor
  onRsvp: (h: HappeningWithAuthor) => void
  onReact: (h: HappeningWithAuthor) => void
  onDelete?: (id: string) => void
  onReport?: (id: string, reason: string) => void
  onShowParticipants?: (h: HappeningWithAuthor) => void
}
```

b) Destructure `onShowParticipants` in the component signature.

c) Insert a new row **above** the existing `{!isExpired && user && (...)}` actions block. Place it directly after the location `<a>` block and before the actions block:

```tsx
<button
  type="button"
  onClick={() => {
    if (h.rsvp_count > 0) onShowParticipants?.(h)
  }}
  disabled={h.rsvp_count === 0}
  className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors enabled:hover:text-brand-700 disabled:cursor-default"
>
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
  {h.rsvp_count > 0 ? `${h.rsvp_count} joined` : 'No one joined yet'}
  {h.rsvp_count > 0 && <span aria-hidden>›</span>}
</button>
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: passes.

- [ ] **Step 3: Manual smoke**

Run `cd rawaq-web && npm run dev`, navigate to a community page that has happenings. Expected:
- Each card shows the new "👥 N joined ›" row above the action buttons.
- Hovering shows the brand color.
- `rsvp_count == 0` shows "No one joined yet" and is non-interactive.
- Click does nothing yet — wired in Task 9.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/components/communities/HappeningCard.tsx
git commit -m "feat(web): add participants row to HappeningCard"
```

---

## Task 8: Build the web participants modal

**Files:**
- Create: `rawaq-web/components/communities/HappeningParticipantsModal.tsx`

- [ ] **Step 1: Write the modal**

Create `rawaq-web/components/communities/HappeningParticipantsModal.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { clientGetJson, isToastHandledError } from '@/lib/client-fetch'
import { formatDate } from '@/lib/utils'

type Participant = {
  id: string
  display_name: string
  avatar_url: string | null
  joined_at: string
  platform_joined_at: string
}

type ParticipantsResponse = {
  total: number
  participants: Participant[]
}

interface Props {
  open: boolean
  happeningId: string | null
  onClose: () => void
}

const PAGE_SIZE = 15

export function HappeningParticipantsModal({ open, happeningId, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !happeningId) return
    let active = true
    const id = happeningId

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await clientGetJson<ParticipantsResponse>(
          `/api/happenings/${id}/participants?limit=${PAGE_SIZE}`,
        )
        if (!active) return
        setTotal(data.total)
        setParticipants(data.participants)
      } catch (err) {
        if (!active) return
        if (!isToastHandledError(err)) setError('Could not load participants.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [open, happeningId])

  return (
    <Modal open={open} onClose={onClose} title="Participants">
      <p className="mb-3 text-xs text-gray-500">{total} joined</p>

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-red-500">{error}</div>
      ) : participants.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">No one has joined yet.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {participants.map((p) => (
            <li key={p.id}>
              <Link
                href={`/user/${p.id}`}
                onClick={onClose}
                className="flex items-center gap-3 py-2.5 transition-colors hover:bg-gray-50 rounded-md px-2 -mx-2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    : p.display_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{p.display_name}</span>
                  <span className="block truncate text-xs text-gray-500">
                    Joined Rawaq · {formatDate(p.platform_joined_at)}
                  </span>
                </span>
                <span aria-hidden className="text-gray-300">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {total > PAGE_SIZE && happeningId && (
        <div className="mt-4 border-t border-gray-100 pt-3 text-center">
          <Link
            href={`/happenings/${happeningId}/participants`}
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            View all {total} participants
            <span aria-hidden>›</span>
          </Link>
        </div>
      )}
    </Modal>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/components/communities/HappeningParticipantsModal.tsx
git commit -m "feat(web): add HappeningParticipantsModal"
```

---

## Task 9: Wire the modal into the web community page

**Files:**
- Modify: `rawaq-web/app/(app)/communities/[slug]/page.tsx`

- [ ] **Step 1: Import the modal and add state**

In `rawaq-web/app/(app)/communities/[slug]/page.tsx`:

a) Add the import near the other happening imports:

```ts
import { HappeningParticipantsModal } from '@/components/communities/HappeningParticipantsModal'
```

b) Inside the component, add state alongside other happening-related state hooks:

```ts
const [participantsHappeningId, setParticipantsHappeningId] = useState<string | null>(null)
```

c) Pass `onShowParticipants` to each `HappeningCard` (around line 950 currently):

```tsx
<HappeningCard
  key={h.id}
  happening={h}
  onRsvp={handleHappeningRsvp}
  onReact={handleHappeningReact}
  onDelete={remove}
  onReport={report}
  onShowParticipants={(target) => setParticipantsHappeningId(target.id)}
/>
```

d) Render the modal once near the bottom of the component's returned JSX (alongside any other modals; if there are no other modals, add it right before the final closing `</div>` of the page):

```tsx
<HappeningParticipantsModal
  open={participantsHappeningId !== null}
  happeningId={participantsHappeningId}
  onClose={() => setParticipantsHappeningId(null)}
/>
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: passes.

- [ ] **Step 3: Manual smoke**

Run dev server, open a community page with at least one happening with `rsvp_count > 0`. Expected:
- Click "👥 N joined ›" → modal opens.
- Header reads "Participants" and "{N} joined".
- Up to 15 rows render. Each shows avatar, display name, "Joined Rawaq · <date>".
- Click a row → navigates to `/user/{id}`, modal closes.
- Click X / overlay / press Esc → modal closes.
- For happenings with `total > 15`, footer shows "View all N participants ›" link.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/(app)/communities/[slug]/page.tsx
git commit -m "feat(web): wire participants modal into community page"
```

---

## Task 10: Build the web full-screen participants route

**Files:**
- Create: `rawaq-web/app/(app)/happenings/[id]/participants/page.tsx`

- [ ] **Step 1: Write the page**

Create `rawaq-web/app/(app)/happenings/[id]/participants/page.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { clientGetJson, isToastHandledError } from '@/lib/client-fetch'
import { formatDate } from '@/lib/utils'

type Participant = {
  id: string
  display_name: string
  avatar_url: string | null
  joined_at: string
  platform_joined_at: string
}

type ParticipantsResponse = {
  total: number
  participants: Participant[]
}

const PAGE_SIZE = 15

export default function HappeningParticipantsPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? null
  const [participants, setParticipants] = useState<Participant[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(async (offset: number, replace: boolean) => {
    if (!id) return
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const data = await clientGetJson<ParticipantsResponse>(
        `/api/happenings/${id}/participants?limit=${PAGE_SIZE}&offset=${offset}`,
        { force: replace },
      )
      setTotal(data.total)
      setParticipants((prev) => (replace ? data.participants : [...prev, ...data.participants]))
    } catch (err) {
      if (!isToastHandledError(err)) setError('Could not load participants.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [id])

  useEffect(() => {
    void fetchPage(0, true)
  }, [fetchPage])

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Participants</h1>
      <p className="mb-6 text-sm text-gray-500">{total} joined</p>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : error ? (
        <div className="py-12 text-center text-sm text-red-500">{error}</div>
      ) : participants.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">No one has joined yet.</div>
      ) : (
        <>
          <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white shadow-sm">
            {participants.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/user/${p.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : p.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{p.display_name}</span>
                    <span className="block truncate text-xs text-gray-500">
                      Joined Rawaq · {formatDate(p.platform_joined_at)}
                    </span>
                  </span>
                  <span aria-hidden className="text-gray-300">›</span>
                </Link>
              </li>
            ))}
          </ul>

          {participants.length < total && (
            <div className="mt-6 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => fetchPage(participants.length, false)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                {loadingMore ? 'Loading…' : `Load more (${total - participants.length} left)`}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: passes.

- [ ] **Step 3: Manual smoke**

Run dev server, navigate to `http://localhost:3000/happenings/<HAPPENING_ID>/participants`. Expected:
- Page renders with header "Participants" and "{N} joined".
- Up to 15 rows render initially.
- "Load more (X left)" button appears if `total > 15`. Click it → next 15 rows append; button disappears when all loaded.
- Each row links to `/user/{id}`.
- For `total = 0` shows the empty state.

Also test the modal's "View all" link from Task 9 → should land on this page.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/(app)/happenings/[id]/participants/page.tsx
git commit -m "feat(web): add full-screen happening participants route"
```

---

## Task 11: Cross-client end-to-end verification

- [ ] **Step 1: Web E2E walkthrough**

Run `cd rawaq-web && npm run dev`. As a logged-in member of a community with at least one happening:
- Open the community page → see "👥 N joined ›" on each happening card.
- Click row → modal opens with up to 15 participants, oldest-first.
- Click a participant → arrives at `/user/<id>`, modal closes.
- For a happening with `> 15` RSVPs (insert via Supabase if needed), click "View all" → arrives at `/happenings/<id>/participants` with paginated list.
- Sign out, try to hit `/api/happenings/<id>/participants` directly with `curl` — expect 401.

- [ ] **Step 2: Mobile E2E walkthrough**

Run `cd rawaq-mobile && npm run start`. As a logged-in user:
- Open the Happenings tab → see "👥 N joined ›" on each card.
- Tap row → bottom sheet appears with up to 15 participants.
- Tap a participant → arrives at user profile, sheet closes.
- For `> 15` RSVPs, tap "View all" → arrives at full-screen route with infinite scroll.
- Pull-to-refresh on the full-screen route resets the list.

- [ ] **Step 3: Final commit (only if any tweaks were needed)**

If smoke testing surfaced bugs, fix and commit. Otherwise nothing to do.

```bash
git status
```
Expected: clean.
