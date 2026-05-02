# Frontend Performance & Caching Analysis

# rawaq-web vs rawaq-mobile

## 1. Techniques Currently Used

### rawaq-web (`rawaq-web/`)

| Technique                   | Module                                                  | Description                                                                           |
| --------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **In-memory JS Cache**      | `lib/client-fetch.ts`                                   | `Map`-based cache with TTL (default 30s). Used for client-side fetching from web API. |
| **Redis Cache**             | `lib/rate-limit.ts`, `app/api/events/featured/route.ts` | Upstash Redis for rate-limiting and caching featured events (5min TTL).               |
| **React Server Components** | `app/(app)/*` pages                                     | RSC architecture - zero client JS for static parts.                                   |
| **Server-side Supabase**    | `lib/supabase/server.ts`                                | Direct DB queries in RSC - no waterfalls.                                             |
| **Suspense Boundaries**     | `app/(app)/events/page.tsx`                             | `<Suspense fallback={...}>` for streaming loading states.                             |
| **Optimistic UI**           | `components/organizer/OrganizerStrings.tsx`             | Feature toggle updates UI immediately, rolls back on error.                           |
| **Debounced Search**        | `rawaq-mobile` (not web)                                | Web has no debounce on event search yet.                                              |
| **Code Splitting**          | Next.js default                                         | Automatic via App Router.                                                             |

### rawaq-mobile (`rawaq-mobile/`)

| Technique                   | Module                                | Description                                                         |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| **In-memory JS Cache**      | `lib/api.ts`                          | `Map`-based cache with TTL (default 30s). Identical pattern to web. |
| **Supabase Realtime**       | `components/layout/Navbar.tsx`        | Realtime subscription for notification bell.                        |
| **Debounced Search**        | `components/screens/EventsScreen.tsx` | 350ms debounce on event search input.                               |
| **Inflight Request Dedupe** | `lib/api.ts`                          | `inflightGets` Map prevents duplicate simultaneous requests.        |
| **Optimistic UI**           | Multiple components                   | Immediate state updates with rollback.                              |
| **Lazy Loading**            | `EventsScreen.tsx`                    | FlatList with `onEndReached` for pagination.                        |
| **Image Priority**          | `components/events/EventCard.tsx`     | `priority` prop for LCP images.                                     |

---

## 2. Gaps & Missing Techniques

### CRITICAL GAPS

| Gap                                   | Web         | Mobile                   | Priority  |
| ------------------------------------- | ----------- | ------------------------ | --------- |
| **No request debounce on web search** | ❌ Missing  | ✅ Has (350ms)           | 🔴 HIGH   |
| **No image optimization tracking**    | Partial     | ✅ Has `priority` prop   | 🟡 MEDIUM |
| **No offline support**                | ❌ None     | ❌ None                  | 🟡 MEDIUM |
| **No cache persistence**              | ❌ RAM only | ❌ RAM only              | 🟡 MEDIUM |
| **No prefetching**                    | ❌ None     | ❌ None                  | 🟢 LOW    |
| **No virtual scrolling**              | N/A         | ❌ FlatList (OK for now) | 🟢 LOW    |

### PERFORMANCE GAPS

| Issue                                      | Location         | Impact               |
| ------------------------------------------ | ---------------- | -------------------- |
| Featured events fetched on EVERY page load | Web homepage     | Redundant DB queries |
| Notifications query slow (504s)            | Web API          | Timeout errors       |
| No service worker                          | Both apps        | No offline/prefetch  |
| No bundle analyzer                         | Both apps        | Unknown bundle size  |
| No loading skeletons for rails             | Mobile discovery | Janky UX             |

---

## 3. Implementation Plan (4 Phases)

### PHASE 1: Web Search Debounce & Optimization (Week 1)

**Priority: HIGH** - Matches mobile's existing pattern

#### Task 1.1: Add debounce to web event search

- **File**: `rawaq-web/components/events/EventFiltersPlayful.tsx`
- **Pattern**: Copy mobile's 350ms debounce
- **Code**:

```typescript
const [search, setSearch] = useState('')
const [debouncedSearch, setDebouncedSearch] = useState('')
useEffect(() => {
  const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 350)
  return () => clearTimeout(timeout)
}, [search])
Task 1.2: Add Redis cache to slow endpoints
- Files:
  - app/api/events/route.ts - Cache event listings (60s)
  - app/api/communities/route.ts - Cache community lists (300s)
- Pattern: Use existing Upstash Redis setup from app/api/events/featured/route.ts
Task 1.3: Add loading skeletons to web rails
- File: rawaq-web/app/(app)/events/page.tsx
- Add: <SkeletonRail /> component for featured/hot offers while loading
---
PHASE 2: Cache Persistence & Offline Support (Week 2-3)
Priority: MEDIUM - Both apps
Task 2.1: Add AsyncStorage persistence to mobile cache
- File: rawaq-mobile/lib/api.ts
- Change: Replace Map with AsyncStorage + memory fallback
import AsyncStorage from '@react-native-async-storage/async-storage'
async function getCached(key: string) {
  try { return JSON.parse(await AsyncStorage.getItem(key) ?? '') }
  catch { return null }
}
Task 2.2: Add IndexedDB persistence to web cache
- File: rawaq-web/lib/client-fetch.ts
- Add: idb-keyval or similar for persistent cache
Task 2.3: Service Worker for offline support
- Files:
  - rawaq-web/public/sw.js (new)
  - rawaq-mobile - Expo has limited SW support, use expo-offline package
- Features: Cache API responses, serve stale-while-revalidate
---
PHASE 3: Prefetching & Smart Loading (Week 3-4)
Priority: LOW - Nice to have
Task 3.1: Prefetch featured events on app launch
- Mobile: app/_layout.tsx - Fetch featured events in root layout
- Web: app/layout.tsx - Add <link rel="prefetch"> for critical paths
Task 3.2: Add virtual scrolling for large lists
- Mobile: Replace FlatList with recyclerlistview for 100+ events
- Web: Add react-window for admin tables
Task 3.3: Bundle analyzer setup
- Both: Add @next/bundle-analyzer to track bundle size
- Goal: Identify and tree-shake unused code
---
PHASE 4: Advanced Optimizations (Week 4+)
Priority: LOW - Future-proofing
Task 4.1: Add request batching
- Both: Combine multiple API calls into single request where possible
- Example: Batch notification reads + event checks
Task 4.2: Add Smart Cache Invalidation
- Web: Use Supabase Realtime to invalidate cache on DB changes
- Mobile: Already has Realtime, extend to cache invalidation
Task 4.3: Add Performance Monitoring
- Both: Integrate Sentry Performance/Web Vitals
- Metrics: LCP, FCP, TTI, bundle size trends
---
4. Quick Wins (Do Immediately)
Change
Add debounce to web search
Add Redis cache to /api/events
Add loading="lazy" to non-critical images
Remove console.error in production
Add memo() to EventCard
---
## 5. Recommended Next Steps
1. **Start with Phase 1, Task 1.1** - Add debounce to web search (matches mobile)
2. **Implement Task 1.2** - Add Redis caching to slow endpoints
3. **Then Phase 2** - Cache persistence for offline support
4. **Monitor impact** via Sentry performance metrics
---
Want me to start implementing any of these tasks? Phase 1 quick wins can be done in this session.
▣  Build · Hy3 Preview Free · 57.8s
```
