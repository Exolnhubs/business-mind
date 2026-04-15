# Plan Subscriber Badge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display tier-specific SVG tick badges (blue / platinum / gold) next to subscriber display names in comments, happenings, and profile pages on both web and mobile.

**Architecture:** One `PlanBadge` SVG component per codebase. Extend the `author` pick in `CommentWithAuthor` and `HappeningWithAuthor` to include `plan_id`. Update 4 API query strings to select `plan_id` from profiles. Drop `<PlanBadge>` inline next to display names at 5 display surfaces across both codebases.

**Tech Stack:** Next.js 14 (App Router), React 18 (`useId`), Tailwind CSS, `react-native-svg` v15, TypeScript.

---

## File Map

| File | Change |
|------|--------|
| `rawaq-web/components/ui/PlanBadge.tsx` | **CREATE** — web SVG badge component |
| `rawaq-web/types/database.ts` | **MODIFY** — add `plan_id` to `HappeningWithAuthor.author` and `CommentWithAuthor.author` |
| `rawaq-web/app/api/comments/route.ts` | **MODIFY** — add `plan_id` to 2 author selects |
| `rawaq-web/app/api/communities/[slug]/happenings/route.ts` | **MODIFY** — add `plan_id` to 2 author selects |
| `rawaq-web/app/api/happenings/discover/route.ts` | **MODIFY** — add `plan_id` to 1 author select |
| `rawaq-web/components/comments/CommentItem.tsx` | **MODIFY** — render badge after author name |
| `rawaq-web/components/communities/HappeningCard.tsx` | **MODIFY** — render badge after author name |
| `rawaq-web/app/(app)/user/[id]/page.tsx` | **MODIFY** — add `plan_id` to DB select, render badge in header |
| `rawaq-mobile/components/ui/PlanBadge.tsx` | **CREATE** — mobile SVG badge component |
| `rawaq-mobile/types/database.ts` | **MODIFY** — add `plan_id` to `HappeningWithAuthor.author` and `CommentWithAuthor.author` |
| `rawaq-mobile/components/comments/CommentItem.tsx` | **MODIFY** — render badge after author name |
| `rawaq-mobile/components/happenings/HappeningDiscoveryCard.tsx` | **MODIFY** — render badge after author name |
| `rawaq-mobile/app/(tabs)/profile.tsx` | **MODIFY** — render badge next to display name in hero |

---

### Task 1: Create web PlanBadge component

**Files:**
- Create: `rawaq-web/components/ui/PlanBadge.tsx`

- [ ] **Step 1: Create the file**

Create `rawaq-web/components/ui/PlanBadge.tsx` with this exact content:

```tsx
'use client'
import { useId } from 'react'

export function PlanBadge({ planId, size = 16 }: { planId?: string | null; size?: number }) {
  const uid = useId().replace(/:/g, '')

  if (planId === 'user_premium') {
    return (
      <svg
        width={size} height={size} viewBox="0 0 20 20" fill="none"
        aria-label="Premium member" role="img"
        style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0 }}
      >
        <circle cx="10" cy="10" r="10" fill="#1D9BF0" />
        <polyline
          points="5,10 8.5,13.5 15,7"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (planId === 'org_pro') {
    return (
      <svg
        width={size} height={size} viewBox="0 0 20 20" fill="none"
        aria-label="Pro organizer" role="img"
        style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0 }}
      >
        <defs>
          <linearGradient id={`plat-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#A8A9AD" />
            <stop offset="100%" stopColor="#E8E9EC" />
          </linearGradient>
        </defs>
        <circle cx="10" cy="10" r="10" fill={`url(#plat-${uid})`} />
        <polyline
          points="5,10 8.5,13.5 15,7"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (planId === 'org_elite') {
    const s = size * (22 / 20)
    return (
      <svg
        width={s} height={s} viewBox="0 0 22 22" fill="none"
        aria-label="Elite organizer" role="img"
        style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0 }}
      >
        <defs>
          <radialGradient id={`gold-${uid}`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFE066" />
            <stop offset="100%" stopColor="#FF8C00" />
          </radialGradient>
        </defs>
        <circle cx="11" cy="11" r="10.5" fill="none" stroke="#FFD700" strokeWidth="1" />
        <circle cx="11" cy="11" r="9" fill={`url(#gold-${uid})`} />
        <polyline
          points="6,11 9.5,14.5 16,8"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    )
  }

  return null
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
cd rawaq-web && git add components/ui/PlanBadge.tsx
git commit -m "feat(web): add PlanBadge SVG component for premium/pro/elite tiers"
```

---

### Task 2: Update web type definitions

**Files:**
- Modify: `rawaq-web/types/database.ts`

- [ ] **Step 1: Add `plan_id` to `HappeningWithAuthor.author`**

Find:
```ts
export interface HappeningWithAuthor extends Happening {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
```

Replace with:
```ts
export interface HappeningWithAuthor extends Happening {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'plan_id'>
```

- [ ] **Step 2: Add `plan_id` to `CommentWithAuthor.author`**

Find:
```ts
export interface CommentWithAuthor extends Comment {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
```

Replace with:
```ts
export interface CommentWithAuthor extends Comment {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'plan_id'>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output. (TypeScript will now require `plan_id` in author shapes — the DB queries don't select it yet, so you may see errors here that resolve after Task 3 and Task 4.)

- [ ] **Step 4: Commit**

```bash
cd rawaq-web && git add types/database.ts
git commit -m "feat(web): add plan_id to CommentWithAuthor and HappeningWithAuthor author picks"
```

---

### Task 3: Update comments API query

**Files:**
- Modify: `rawaq-web/app/api/comments/route.ts`

- [ ] **Step 1: Update the GET query (line ~22)**

Find:
```ts
         author:profiles!user_id(id, display_name, avatar_url)`,
```

Replace with:
```ts
         author:profiles!user_id(id, display_name, avatar_url, plan_id)`,
```

- [ ] **Step 2: Update the POST query (line ~168)**

Find:
```ts
               author:profiles!user_id(id, display_name, avatar_url)`)
```

Replace with:
```ts
               author:profiles!user_id(id, display_name, avatar_url, plan_id)`)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd rawaq-web && git add "app/api/comments/route.ts"
git commit -m "feat(web): select plan_id in comments API author queries"
```

---

### Task 4: Update happenings API queries

**Files:**
- Modify: `rawaq-web/app/api/communities/[slug]/happenings/route.ts`
- Modify: `rawaq-web/app/api/happenings/discover/route.ts`

- [ ] **Step 1: Update the community happenings GET query (line ~59)**

In `rawaq-web/app/api/communities/[slug]/happenings/route.ts`, find:
```ts
        author:profiles!author_id(id, display_name, avatar_url)
      `)
      .eq('community_id', community.id)
```

Replace with:
```ts
        author:profiles!author_id(id, display_name, avatar_url, plan_id)
      `)
      .eq('community_id', community.id)
```

- [ ] **Step 2: Update the community happenings POST select (line ~154)**

In the same file, find:
```ts
        author:profiles!author_id(id, display_name, avatar_url)
      `)
      .single()
```

Replace with:
```ts
        author:profiles!author_id(id, display_name, avatar_url, plan_id)
      `)
      .single()
```

- [ ] **Step 3: Update the discover happenings query (line ~98)**

In `rawaq-web/app/api/happenings/discover/route.ts`, find:
```ts
        author:profiles!author_id(id, display_name, avatar_url),
```

Replace with:
```ts
        author:profiles!author_id(id, display_name, avatar_url, plan_id),
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd rawaq-web && git add "app/api/communities/[slug]/happenings/route.ts" "app/api/happenings/discover/route.ts"
git commit -m "feat(web): select plan_id in happenings API author queries"
```

---

### Task 5: Render badge in web CommentItem

**Files:**
- Modify: `rawaq-web/components/comments/CommentItem.tsx`

- [ ] **Step 1: Add the import**

Find the existing imports at the top of the file. After the last import line, add:

```tsx
import { PlanBadge } from '@/components/ui/PlanBadge'
```

- [ ] **Step 2: Wrap name + badge in the comment header**

Find:
```tsx
        <div className="flex items-baseline gap-2 mb-0.5">
          <Link
            href={comment.author?.id ? `/user/${comment.author.id}` : '#'}
            className="text-sm font-semibold text-gray-900 hover:text-brand-600 transition-colors"
          >
            {comment.author?.display_name ?? 'Unknown'}
          </Link>
          <span className="text-xs text-gray-400">
            {formatRelativeTime(comment.created_at)}
          </span>
        </div>
```

Replace with:
```tsx
        <div className="flex items-center gap-2 mb-0.5">
          <span className="inline-flex items-center gap-1">
            <Link
              href={comment.author?.id ? `/user/${comment.author.id}` : '#'}
              className="text-sm font-semibold text-gray-900 hover:text-brand-600 transition-colors"
            >
              {comment.author?.display_name ?? 'Unknown'}
            </Link>
            <PlanBadge planId={comment.author?.plan_id} size={14} />
          </span>
          <span className="text-xs text-gray-400">
            {formatRelativeTime(comment.created_at)}
          </span>
        </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd rawaq-web && git add components/comments/CommentItem.tsx
git commit -m "feat(web): show plan badge next to comment author name"
```

---

### Task 6: Render badge in web HappeningCard

**Files:**
- Modify: `rawaq-web/components/communities/HappeningCard.tsx`

- [ ] **Step 1: Add the import**

Add after the last existing import in the file:

```tsx
import { PlanBadge } from '@/components/ui/PlanBadge'
```

- [ ] **Step 2: Render badge after author display name**

Find:
```tsx
          <p className="leading-tight text-sm font-semibold text-gray-900">{h.author.display_name}</p>
```

Replace with:
```tsx
          <p className="leading-tight text-sm font-semibold text-gray-900 flex items-center gap-1">
            {h.author.display_name}
            <PlanBadge planId={h.author.plan_id} size={14} />
          </p>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd rawaq-web && git add components/communities/HappeningCard.tsx
git commit -m "feat(web): show plan badge next to happening author name"
```

---

### Task 7: Render badge on web public user profile

**Files:**
- Modify: `rawaq-web/app/(app)/user/[id]/page.tsx`

- [ ] **Step 1: Add the import**

Add after the last existing import at the top of the file:

```tsx
import { PlanBadge } from '@/components/ui/PlanBadge'
```

- [ ] **Step 2: Add `plan_id` to the profiles DB select**

Find:
```ts
      .select('id, display_name, avatar_url, city, bio, role, created_at')
```

Replace with:
```ts
      .select('id, display_name, avatar_url, city, bio, role, plan_id, created_at')
```

- [ ] **Step 3: Render badge in the profile header**

Find:
```tsx
            <h1 className="text-xl font-bold text-gray-900">{profile.display_name}</h1>
```

Replace with:
```tsx
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-1.5">
              {profile.display_name}
              <PlanBadge planId={profile.plan_id} size={18} />
            </h1>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 5: Manual web verification**

Start the dev server (`npm run dev` in `rawaq-web/`) and verify:

| Check | Expected |
|-------|----------|
| Visit `/user/<id>` for a `user_premium` user | Blue tick next to name |
| Visit `/user/<id>` for an `org_pro` user | Silver/platinum tick next to name |
| Visit `/user/<id>` for an `org_elite` user | Gold tick with outer ring next to name |
| Visit `/user/<id>` for a `user_free` user | No badge |
| Open an event with comments from a premium user | Blue tick next to name in comments |
| Open a community feed with happenings | Badge shows next to happening author names |

- [ ] **Step 6: Commit**

```bash
cd rawaq-web && git add "app/(app)/user/[id]/page.tsx"
git commit -m "feat(web): show plan badge on public user profile page"
```

---

### Task 8: Create mobile PlanBadge component

**Files:**
- Create: `rawaq-mobile/components/ui/PlanBadge.tsx`

- [ ] **Step 1: Create the file**

Create `rawaq-mobile/components/ui/PlanBadge.tsx` with this exact content:

```tsx
import Svg, { Circle, Polyline, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg'

export function PlanBadge({ planId, size = 16 }: { planId?: string | null; size?: number }) {
  if (planId === 'user_premium') {
    return (
      <Svg width={size} height={size} viewBox="0 0 20 20">
        <Circle cx="10" cy="10" r="10" fill="#1D9BF0" />
        <Polyline
          points="5,10 8.5,13.5 15,7"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </Svg>
    )
  }

  if (planId === 'org_pro') {
    return (
      <Svg width={size} height={size} viewBox="0 0 20 20">
        <Defs>
          <LinearGradient id="plat" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#A8A9AD" />
            <Stop offset="100%" stopColor="#E8E9EC" />
          </LinearGradient>
        </Defs>
        <Circle cx="10" cy="10" r="10" fill="url(#plat)" />
        <Polyline
          points="5,10 8.5,13.5 15,7"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </Svg>
    )
  }

  if (planId === 'org_elite') {
    const s = size * (22 / 20)
    return (
      <Svg width={s} height={s} viewBox="0 0 22 22">
        <Defs>
          <RadialGradient id="gold" cx="35%" cy="35%" r="65%">
            <Stop offset="0%" stopColor="#FFE066" />
            <Stop offset="100%" stopColor="#FF8C00" />
          </RadialGradient>
        </Defs>
        <Circle cx="11" cy="11" r="10.5" fill="none" stroke="#FFD700" strokeWidth="1" />
        <Circle cx="11" cy="11" r="9" fill="url(#gold)" />
        <Polyline
          points="6,11 9.5,14.5 16,8"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </Svg>
    )
  }

  return null
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd rawaq-mobile && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd rawaq-mobile && git add components/ui/PlanBadge.tsx
git commit -m "feat(mobile): add PlanBadge SVG component for premium/pro/elite tiers"
```

---

### Task 9: Update mobile type definitions

**Files:**
- Modify: `rawaq-mobile/types/database.ts`

- [ ] **Step 1: Add `plan_id` to `HappeningWithAuthor.author`**

Find:
```ts
export interface HappeningWithAuthor extends Happening {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
```

Replace with:
```ts
export interface HappeningWithAuthor extends Happening {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'plan_id'>
```

- [ ] **Step 2: Add `plan_id` to `CommentWithAuthor.author`**

Find:
```ts
export interface CommentWithAuthor extends Comment {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
```

Replace with:
```ts
export interface CommentWithAuthor extends Comment {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'plan_id'>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-mobile && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd rawaq-mobile && git add types/database.ts
git commit -m "feat(mobile): add plan_id to CommentWithAuthor and HappeningWithAuthor author picks"
```

---

### Task 10: Render badge in mobile CommentItem

**Files:**
- Modify: `rawaq-mobile/components/comments/CommentItem.tsx`

- [ ] **Step 1: Add the import**

Add after the last existing import in the file:

```tsx
import { PlanBadge } from '@/components/ui/PlanBadge'
```

- [ ] **Step 2: Wrap name + badge in a row View**

Find:
```tsx
        <View style={styles.header}>
          <TouchableOpacity onPress={goToProfile}>
            <Text style={styles.name}>{comment.author?.display_name ?? 'Unknown'}</Text>
          </TouchableOpacity>
          <Text style={styles.time}>{formatRelativeTime(comment.created_at)}</Text>
        </View>
```

Replace with:
```tsx
        <View style={styles.header}>
          <TouchableOpacity onPress={goToProfile} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.name}>{comment.author?.display_name ?? 'Unknown'}</Text>
            <PlanBadge planId={comment.author?.plan_id} size={14} />
          </TouchableOpacity>
          <Text style={styles.time}>{formatRelativeTime(comment.created_at)}</Text>
        </View>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-mobile && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd rawaq-mobile && git add components/comments/CommentItem.tsx
git commit -m "feat(mobile): show plan badge next to comment author name"
```

---

### Task 11: Render badge in mobile HappeningDiscoveryCard

**Files:**
- Modify: `rawaq-mobile/components/happenings/HappeningDiscoveryCard.tsx`

- [ ] **Step 1: Add the import**

Add after the last existing import:

```tsx
import { PlanBadge } from '@/components/ui/PlanBadge'
```

- [ ] **Step 2: Replace author text with row containing badge**

Find:
```tsx
      <View style={styles.footer}>
        <Text style={styles.authorText} numberOfLines={1}>
          {happening.author.display_name}
        </Text>
```

Replace with:
```tsx
      <View style={styles.footer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.sm }}>
          <Text style={[styles.authorText, { marginBottom: 0 }]} numberOfLines={1}>
            {happening.author.display_name}
          </Text>
          <PlanBadge planId={happening.author.plan_id} size={13} />
        </View>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-mobile && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd rawaq-mobile && git add components/happenings/HappeningDiscoveryCard.tsx
git commit -m "feat(mobile): show plan badge next to happening author name"
```

---

### Task 12: Render badge in mobile profile hero

**Files:**
- Modify: `rawaq-mobile/app/(tabs)/profile.tsx`

- [ ] **Step 1: Add the import**

Find the existing import block at the top of `profile.tsx`. Add after the last import:

```tsx
import { PlanBadge } from '@/components/ui/PlanBadge'
```

- [ ] **Step 2: Wrap display name + badge in a row View**

Find:
```tsx
          <Text style={styles.displayName}>{profile?.display_name ?? t('profile.title')}</Text>
```

Replace with:
```tsx
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.displayName}>{profile?.display_name ?? t('profile.title')}</Text>
            <PlanBadge planId={profile?.plan_id} size={18} />
          </View>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-mobile && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 4: Manual mobile verification**

Run the app (`npx expo start`) and verify:

| Check | Expected |
|-------|----------|
| Profile screen for `user_premium` user | Blue tick next to display name in hero |
| Profile screen for `org_pro` user | Platinum tick next to display name |
| Profile screen for `org_elite` user | Gold tick with outer ring next to display name |
| Profile screen for `user_free` user | No badge |
| Community feed happenings | Badge next to happening author names |
| Comment threads | Badge next to comment author names |

- [ ] **Step 5: Final commit**

```bash
cd rawaq-mobile && git add "app/(tabs)/profile.tsx"
git commit -m "feat(mobile): show plan badge next to display name in profile hero"
```
