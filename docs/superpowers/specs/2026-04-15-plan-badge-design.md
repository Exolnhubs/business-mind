# Plan Subscriber Badge — Design Spec

**Date:** 2026-04-15
**Status:** Approved
**Scope:** Web (`rawaq-web`) + Mobile (`rawaq-mobile`)

---

## Goal

Display a small SVG verification-style tick badge next to a subscriber's display name on every surface where their name appears — comments, happenings, and profile pages — indicating their membership tier.

---

## Badge Tiers

| `plan_id`      | Badge        | Visual                                                          |
|----------------|--------------|------------------------------------------------------------------|
| `user_premium` | Blue tick    | Solid `#1D9BF0` circle + white checkmark (Twitter-style)        |
| `org_pro`      | Platinum tick| Linear gradient `#A8A9AD → #E8E9EC` circle + white checkmark   |
| `org_elite`    | Gold tick    | Radial gradient `#FFE066 → #FF8C00` circle + thin `#FFD700` outer ring + white checkmark |
| `user_free`    | None         | No badge rendered                                               |
| `org_basic`    | None         | No badge rendered                                               |

The elite badge is 22×22 (vs 20×20) to accommodate the outer ring without clipping it.

---

## Architecture

### Web component: `rawaq-web/components/ui/PlanBadge.tsx`

A client-safe React component. Props: `{ planId?: string | null; size?: number }`. Returns `null` for any plan that has no badge. Uses `useId()` (React 18) to generate unique gradient IDs per instance — preventing gradient bleed when multiple badges appear on the same page.

```tsx
'use client'
import { useId } from 'react'

export function PlanBadge({ planId, size = 16 }: { planId?: string | null; size?: number }) {
  const uid = useId().replace(/:/g, '')

  if (planId === 'user_premium') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
        aria-label="Premium member" role="img" style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0 }}>
        <circle cx="10" cy="10" r="10" fill="#1D9BF0" />
        <polyline points="5,10 8.5,13.5 15,7"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (planId === 'org_pro') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
        aria-label="Pro organizer" role="img" style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0 }}>
        <defs>
          <linearGradient id={`plat-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#A8A9AD" />
            <stop offset="100%" stopColor="#E8E9EC" />
          </linearGradient>
        </defs>
        <circle cx="10" cy="10" r="10" fill={`url(#plat-${uid})`} />
        <polyline points="5,10 8.5,13.5 15,7"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (planId === 'org_elite') {
    const s = size * (22 / 20) // elite viewBox is 22×22
    return (
      <svg width={s} height={s} viewBox="0 0 22 22" fill="none"
        aria-label="Elite organizer" role="img" style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0 }}>
        <defs>
          <radialGradient id={`gold-${uid}`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFE066" />
            <stop offset="100%" stopColor="#FF8C00" />
          </radialGradient>
        </defs>
        <circle cx="11" cy="11" r="10.5" fill="none" stroke="#FFD700" strokeWidth="1" />
        <circle cx="11" cy="11" r="9" fill={`url(#gold-${uid})`} />
        <polyline points="6,11 9.5,14.5 16,8"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return null
}
```

### Mobile component: `rawaq-mobile/components/ui/PlanBadge.tsx`

Uses `react-native-svg` (already installed, v15). Same logic, same visual output. `react-native-svg` scopes gradients per SVG instance automatically — no unique ID needed.

```tsx
import Svg, { Circle, Polyline, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg'

export function PlanBadge({ planId, size = 16 }: { planId?: string | null; size?: number }) {
  if (planId === 'user_premium') {
    return (
      <Svg width={size} height={size} viewBox="0 0 20 20">
        <Circle cx="10" cy="10" r="10" fill="#1D9BF0" />
        <Polyline points="5,10 8.5,13.5 15,7"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
        <Polyline points="5,10 8.5,13.5 15,7"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
        <Polyline points="6,11 9.5,14.5 16,8"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    )
  }
  return null
}
```

---

## Type Changes (both codebases)

`plan_id` added to the author pick in both shared shapes:

```ts
// rawaq-web/types/database.ts  AND  rawaq-mobile/types/database.ts

export interface HappeningWithAuthor extends Happening {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'plan_id'>
  ...
}

export interface CommentWithAuthor extends Comment {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'plan_id'>
  ...
}
```

---

## DB Query Changes (web API routes only — mobile consumes the same APIs)

Exact string to find and replace in each file:

| File | Find | Replace |
|------|------|---------|
| `rawaq-web/app/api/comments/route.ts` (×2) | `author:profiles!user_id(id, display_name, avatar_url)` | `author:profiles!user_id(id, display_name, avatar_url, plan_id)` |
| `rawaq-web/app/api/communities/[slug]/happenings/route.ts` (×2) | `author:profiles!author_id(id, display_name, avatar_url)` | `author:profiles!author_id(id, display_name, avatar_url, plan_id)` |
| `rawaq-web/app/api/happenings/discover/route.ts` (×1) | `author:profiles!author_id(id, display_name, avatar_url),` | `author:profiles!author_id(id, display_name, avatar_url, plan_id),` |

---

## Display Integration

### Web — `rawaq-web/components/comments/CommentItem.tsx`

In the comment header, wrap name + badge together:

```tsx
// Find:
<Link href={...} className="text-sm font-semibold text-gray-900 hover:text-brand-600 transition-colors">
  {comment.author?.display_name ?? 'Unknown'}
</Link>

// Replace with:
<span className="inline-flex items-center gap-1">
  <Link href={...} className="text-sm font-semibold text-gray-900 hover:text-brand-600 transition-colors">
    {comment.author?.display_name ?? 'Unknown'}
  </Link>
  <PlanBadge planId={comment.author?.plan_id} size={14} />
</span>
```

### Web — `rawaq-web/components/communities/HappeningCard.tsx`

In the author row:

```tsx
// Find:
<p className="leading-tight text-sm font-semibold text-gray-900">{h.author.display_name}</p>

// Replace with:
<p className="leading-tight text-sm font-semibold text-gray-900 flex items-center gap-1">
  {h.author.display_name}
  <PlanBadge planId={h.author.plan_id} size={14} />
</p>
```

### Web — `rawaq-web/app/(app)/user/[id]/page.tsx`

Add `plan_id` to the profiles select query, then render badge inline:

```tsx
// In the DB query, find:
.select('id, display_name, avatar_url, city, bio, role, created_at')
// Replace with:
.select('id, display_name, avatar_url, city, bio, role, plan_id, created_at')

// In JSX, find:
<h1 className="text-xl font-bold text-gray-900">{profile.display_name}</h1>
// Replace with:
<h1 className="text-xl font-bold text-gray-900 flex items-center gap-1.5">
  {profile.display_name}
  <PlanBadge planId={profile.plan_id} size={18} />
</h1>
```

Note: The page currently selects `'id, display_name, avatar_url, city, bio, role, created_at'` — `plan_id` does not need to be in the TypeScript interface for this page since `profile` is typed inline from the Supabase response. Just add it to the select string and use it.

### Mobile — `rawaq-mobile/components/comments/CommentItem.tsx`

In the header `View`:

```tsx
// Find:
<Text style={styles.name}>{comment.author?.display_name ?? 'Unknown'}</Text>

// Replace with:
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
  <Text style={styles.name}>{comment.author?.display_name ?? 'Unknown'}</Text>
  <PlanBadge planId={comment.author?.plan_id} size={14} />
</View>
```

### Mobile — `rawaq-mobile/components/happenings/HappeningDiscoveryCard.tsx`

In the footer author text:

```tsx
// Find:
<Text style={styles.authorText} numberOfLines={1}>
  {happening.author.display_name}
</Text>

// Replace with:
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.sm }}>
  <Text style={[styles.authorText, { marginBottom: 0 }]} numberOfLines={1}>
    {happening.author.display_name}
  </Text>
  <PlanBadge planId={happening.author.plan_id} size={13} />
</View>
```

### Mobile — `rawaq-mobile/app/(tabs)/profile.tsx`

In the hero section, next to the display name:

```tsx
// Find:
<Text style={styles.displayName}>{profile?.display_name ?? t('profile.title')}</Text>

// Replace with:
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
  <Text style={styles.displayName}>{profile?.display_name ?? t('profile.title')}</Text>
  <PlanBadge planId={profile?.plan_id} size={18} />
</View>
```

---

## What Is NOT in Scope

- No badge on event cards (organizer name there is from `organizer_profile.business_name`, not personal plan)
- No badge in admin panels
- No Supabase migration — `plan_id` already exists on `profiles` and `organizer_profiles`; we're just selecting it in more queries
- No mobile API routes — mobile reads from the same web API, plan_id flows through automatically once web queries are updated
