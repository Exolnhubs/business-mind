# Spec: Performance Gaps Phase 1 — Redis Communities Cache + Mobile Rail Skeletons

**Date:** 2026-04-24  
**Scope:** Two high-priority items from `docs/superpowers/plans/2026-04-23-front-end-gaps.md`

---

## Task 1 — Redis Cache for `/api/communities` (web)

### Goal
Reduce repeated DB hits on the public communities listing. Communities change infrequently; a 5-minute server-side cache eliminates redundant queries for the default discovery view.

### Pattern
Follows the exact implementation in `rawaq-web/app/api/events/route.ts`:
- `Redis.fromEnv()` singleton at module scope
- Cache key built from request params
- Try cache before DB query; write cache after full response is built

### Cache Key
Built from non-personal params only: `level`, `type`, `city`, `q`, `page`, `per_page`, `ancestor_slug`.  
Key format: `communities:list:<JSON-sorted-params>`

### Cache Bypass Rules (any of these skips the cache entirely)
| Condition | Reason |
|-----------|--------|
| `member_only=true` | Per-user membership data |
| `recommended=true` | Per-user interest/city matching |
| `user_id` param set | Another user's community list |
| `approval_status` param set | Admin-only filtered view |

### TTL
300 seconds (5 minutes). Communities data changes far less frequently than events.

### Write Point
After the full enriched response object is assembled (post event-count enrichment, post `is_member` annotation) — immediately before `return ok(...)`. Only write when the cache key is non-null (i.e., not bypassed).

### File
`rawaq-web/app/api/communities/route.ts` — `GET` handler only.

---

## Task 2 — Horizontal Rail Skeletons (mobile)

### Goal
Eliminate the pop-in jank where the Featured Events rail appears after the main event list has already rendered. Replace the empty gap with a shimmer skeleton that matches the rail's real dimensions.

### New Component: `RailSkeleton`

**Location:** `rawaq-mobile/components/events/EventCard.tsx` — exported alongside `EventCardSkeleton`.

**Props:**
```ts
interface RailSkeletonProps {
  variant: 'featured' | 'hot'
}
```

**Structure:**
```
<View> [full-width section wrapper — matches hotRailSection style]
  <View> [header row]
    <View> [left: eyebrow bar 60×10, title bar 160×22]
    <View> [right: badge pill 50×24]
  <ScrollView horizontal>
    <SkeletonCard /> × 3  [each: 268px wide, 148px cover + 2 body lines]
```

**Styling:**
- `variant="hot"` → section background `#1a0d04` (matches `hotRailSection`)
- `variant="featured"` → section background `Colors.brand[50]` with `marginHorizontal: Spacing.lg` and `borderRadius: Radius.lg` (matches FeaturedEventsRail wrapper)
- All shimmer bars use the same `Animated.Value` pulse as `EventCardSkeleton` (opacity 0.45 → 0.88, 900ms loop)
- Skeleton card cover: `backgroundColor: Colors.gray[200]` (neutral, works on both dark/light backgrounds)
- Skeleton bars: `backgroundColor: Colors.gray[300]` on featured, `rgba(255,255,255,0.12)` on hot (visible on dark bg)

### New State: `featuredLoading`

**Location:** `EventsScreen` component state.

```ts
const [featuredLoading, setFeaturedLoading] = useState(true)
```

Set to `false` inside `fetchFeaturedEvents` after the first successful resolution (both success and error paths).

### Usage in `ListHeaderComponent`

Replace current featured rail render with:

```tsx
{showRecommendationRails && (
  featuredLoading
    ? <RailSkeleton variant="featured" />
    : featuredEvents.length > 0 && <FeaturedEventsRail ... />
)}
{showRecommendationRails && <HotOffersRail ... />}
```

Hot offers do not need a skeleton: they are fetched inside `fetchEvents` and are available the moment the FlatList renders (when `loading` turns false).

### Files Changed
- `rawaq-mobile/components/events/EventCard.tsx` — add `RailSkeleton` export
- `rawaq-mobile/components/screens/EventsScreen.tsx` — add `featuredLoading` state, update `fetchFeaturedEvents`, update `ListHeaderComponent`
