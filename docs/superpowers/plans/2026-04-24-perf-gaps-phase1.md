# Perf Gaps Phase 1 — Redis Communities Cache + Mobile Rail Skeletons

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5-minute Redis cache to the `/api/communities` public listing endpoint and add shimmer rail skeletons to the mobile discovery screen so featured events have a placeholder while loading.

**Architecture:** Task 1 follows the existing Redis pattern in `/api/events/route.ts` — same key/TTL/bypass logic, applied to communities. Task 2 adds a `RailSkeleton` component (exported from `EventCard.tsx`) and a `featuredLoading` boolean state in `EventsScreen` to swap the real rail for the skeleton until data arrives.

**Tech Stack:** Upstash Redis (`@upstash/redis`), React Native `Animated`, TypeScript.

---

## File Map

| File | Change |
|------|--------|
| `rawaq-web/app/api/communities/route.ts` | Add Redis import, cache key builder, bypass logic, try-cache + write-cache around the GET handler |
| `rawaq-mobile/components/events/EventCard.tsx` | Add `RailSkeleton` export, add `ScrollView` + `Radius` imports |
| `rawaq-mobile/components/screens/EventsScreen.tsx` | Add `featuredLoading` state, update `fetchFeaturedEvents`, update `ListHeaderComponent` |

---

## Task 1: Redis cache on `/api/communities`

**Files:**
- Modify: `rawaq-web/app/api/communities/route.ts`

- [ ] **Step 1: Add Redis import and constants at the top of the file**

Open `rawaq-web/app/api/communities/route.ts`. After the existing `import { z } from 'zod'` line add:

```ts
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()
const COMMUNITY_CACHE_TTL = 300 // 5 minutes
```

- [ ] **Step 2: Add the cache key builder function**

After the `INTEREST_TO_COMMUNITY_TYPES` map (around line 109, before the `extractRecommendedCommunityTypes` function), add:

```ts
function buildCommunityCacheKey(params: {
  level?: string
  type?: string
  city?: string
  q?: string
  page: number
  per_page: number
  ancestor_slug?: string
}): string {
  return `communities:list:${JSON.stringify({
    level: params.level ?? null,
    type: params.type ?? null,
    city: params.city ?? null,
    q: params.q ?? null,
    page: params.page,
    per_page: params.per_page,
    ancestor_slug: params.ancestor_slug ?? null,
  })}`
}
```

- [ ] **Step 3: Determine the cache key after `optionalAuth` resolves**

In the `GET` handler, `optionalAuth()` is already called and stored in `ctx` (around line 141). Immediately after that line, add the bypass check:

```ts
const urlParams = req.nextUrl.searchParams
const isPersonalized =
  urlParams.get('member_only') === 'true' ||
  urlParams.get('recommended') === 'true' ||
  urlParams.has('user_id') ||
  urlParams.has('approval_status') ||
  !!ctx?.userId   // logged-in users get fresh is_member annotations

const cacheKey = isPersonalized
  ? null
  : buildCommunityCacheKey(params)
```

- [ ] **Step 4: Try the cache before running any DB queries**

Immediately after the `cacheKey` assignment from Step 3, add:

```ts
if (cacheKey) {
  const cached = await redis.get(cacheKey)
  if (cached) return ok(cached)
}
```

- [ ] **Step 5: Write to cache after the enriched response is assembled**

Find the `return ok({...})` statement at the end of the GET handler (around line 349). Replace it with:

```ts
const response = {
  data: enriched,
  total: count ?? 0,
  page: params.page,
  per_page: params.per_page,
  has_more: (count ?? 0) > to + 1,
}

if (cacheKey) {
  await redis.setex(cacheKey, COMMUNITY_CACHE_TTL, response)
}

return ok(response)
```

- [ ] **Step 6: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 7: Manual smoke test**

Start the dev server (`npm run dev` in `rawaq-web`). Open browser DevTools → Network tab.

1. Visit `/communities` (unauthenticated or incognito). Note the response time on `/api/communities`.
2. Hard-refresh. Second request should return visibly faster (Redis hit — no DB round-trip).
3. Log in and visit `/communities`. Confirm `is_member` values are correct (cache bypassed for authenticated users).

- [ ] **Step 8: Commit**

```bash
git add rawaq-web/app/api/communities/route.ts
git commit -m "perf: add 5-min Redis cache to /api/communities public listing"
```

---

## Task 2a: Add `RailSkeleton` to `EventCard.tsx`

**Files:**
- Modify: `rawaq-mobile/components/events/EventCard.tsx`

- [ ] **Step 1: Add `ScrollView` and `Radius` to imports**

At the top of `rawaq-mobile/components/events/EventCard.tsx`, update the two import lines:

```ts
// Line 2 — add ScrollView
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated, Alert, ScrollView } from 'react-native'

// Line 9 — add Radius
import { Colors, Spacing, Radius } from '@/theme'
```

- [ ] **Step 2: Add the `RailSkeleton` component**

Place this block immediately after the closing brace of `EventCardSkeleton` (after line 209, before the `// ── Styles ──` comment):

```tsx
// ── Rail Skeleton ──────────────────────────────────────────────
export function RailSkeleton({ variant }: { variant: 'featured' | 'hot' }) {
  const shimmer = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [shimmer])

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.88] })
  const isFeatured = variant === 'featured'
  const barColor    = isFeatured ? Colors.gray[300] : 'rgba(255,255,255,0.18)'
  const coverColor  = isFeatured ? Colors.gray[200] : 'rgba(255,255,255,0.12)'

  return (
    <View style={[
      railSkeletonStyles.section,
      isFeatured && {
        backgroundColor: Colors.brand[50],
        marginHorizontal: Spacing.lg,
        borderRadius: Radius.lg,
      },
    ]}>
      <Animated.View style={[railSkeletonStyles.header, { opacity }]}>
        <View style={railSkeletonStyles.headerLeft}>
          <View style={[railSkeletonStyles.eyebrow, { backgroundColor: barColor }]} />
          <View style={[railSkeletonStyles.title,   { backgroundColor: barColor }]} />
        </View>
        <View style={[railSkeletonStyles.badge, { backgroundColor: barColor }]} />
      </Animated.View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={railSkeletonStyles.scroller}
      >
        {[1, 2, 3].map((i) => (
          <Animated.View key={i} style={[railSkeletonStyles.card, { opacity }]}>
            <View style={[railSkeletonStyles.cardCover, { backgroundColor: coverColor }]} />
            <View style={railSkeletonStyles.cardBody}>
              <View style={[railSkeletonStyles.cardLine,      { backgroundColor: barColor }]} />
              <View style={[railSkeletonStyles.cardLineShort, { backgroundColor: barColor }]} />
            </View>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  )
}

const railSkeletonStyles = StyleSheet.create({
  section: {
    marginBottom: Spacing.lg,
    marginTop: Spacing.xs,
    marginHorizontal: -Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    backgroundColor: '#1a0d04',
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  headerLeft: { gap: 6 },
  eyebrow:    { width: 60,  height: 10, borderRadius: 4 },
  title:      { width: 160, height: 22, borderRadius: 6 },
  badge:      { width: 50,  height: 24, borderRadius: Radius.full },
  scroller:   { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs, gap: Spacing.sm },
  card:       { width: 268, borderRadius: Radius.lg, overflow: 'hidden' },
  cardCover:  { height: 148 },
  cardBody:   { paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, gap: 6 },
  cardLine:       { height: 14, borderRadius: 4 },
  cardLineShort:  { height: 12, width: '62%', borderRadius: 4 },
})
```

- [ ] **Step 3: Type-check**

```bash
cd rawaq-mobile && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add rawaq-mobile/components/events/EventCard.tsx
git commit -m "feat(mobile): add RailSkeleton shimmer component for horizontal event rails"
```

---

## Task 2b: Wire `RailSkeleton` into `EventsScreen`

**Files:**
- Modify: `rawaq-mobile/components/screens/EventsScreen.tsx`

- [ ] **Step 1: Import `RailSkeleton`**

Find the existing import of `EventCard` and `EventCardSkeleton` at the top of `EventsScreen.tsx`:

```ts
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
```

Replace it with:

```ts
import { EventCard, EventCardSkeleton, RailSkeleton } from '@/components/events/EventCard'
```

- [ ] **Step 2: Add `featuredLoading` state**

In the state declarations block (around line 212, next to the existing `loading` state), add:

```ts
const [featuredLoading, setFeaturedLoading] = useState(true)
```

- [ ] **Step 3: Set `featuredLoading` to false when `fetchFeaturedEvents` resolves**

Find `fetchFeaturedEvents` (around line 422). It currently looks like:

```ts
const fetchFeaturedEvents = useCallback(async (force = false) => {
  const { data, error } = await apiGet<{ featured: EventWithOrganizer[]; total: number }>(
    '/api/events/featured',
    { force, ttlMs: 300_000 },
  )
  if (error || !data) {
    setFeaturedEvents([])
    return
  }
  setFeaturedEvents(data.featured ?? [])
}, [])
```

Replace it with:

```ts
const fetchFeaturedEvents = useCallback(async (force = false) => {
  const { data, error } = await apiGet<{ featured: EventWithOrganizer[]; total: number }>(
    '/api/events/featured',
    { force, ttlMs: 300_000 },
  )
  if (error || !data) {
    setFeaturedEvents([])
    setFeaturedLoading(false)
    return
  }
  setFeaturedEvents(data.featured ?? [])
  setFeaturedLoading(false)
}, [])
```

- [ ] **Step 4: Replace the featured rail render with skeleton-aware version**

In the `ListHeaderComponent`, find this block (around line 1233):

```tsx
{/* Featured Events — pinned by organizers, shown first */}
{showRecommendationRails && featuredEvents.length > 0 && (
  <FeaturedEventsRail
    events={featuredEvents}
    savedIds={savedIds}
    onSaveChange={handleSaveChange}
  />
)}
```

Replace it with:

```tsx
{/* Featured Events — skeleton while loading, real rail once resolved */}
{showRecommendationRails && (
  featuredLoading
    ? <RailSkeleton variant="featured" />
    : featuredEvents.length > 0 && (
        <FeaturedEventsRail
          events={featuredEvents}
          savedIds={savedIds}
          onSaveChange={handleSaveChange}
        />
      )
)}
```

- [ ] **Step 5: Type-check**

```bash
cd rawaq-mobile && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Manual smoke test on device/simulator**

Run `npx expo start` in `rawaq-mobile`.

1. Open the Events screen on a slow network (or throttle in dev tools).
2. Confirm a shimmer rail appears in the Featured Events slot before the real data loads.
3. Confirm the shimmer rail disappears and the real FeaturedEventsRail appears after data loads.
4. Pull to refresh — confirm skeleton reappears briefly then resolves.
5. When there are no featured events: confirm no skeleton shows after `featuredLoading` turns false (blank slot, not skeleton).

- [ ] **Step 7: Commit**

```bash
git add rawaq-mobile/components/screens/EventsScreen.tsx
git commit -m "feat(mobile): show shimmer skeleton for featured events rail while loading"
```
