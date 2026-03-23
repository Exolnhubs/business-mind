# Rawaq — Database Schema Reference

## Entity Relationship Overview

```
auth.users (Supabase managed)
    │
    └─1:1─► profiles (role, gender, city, preferences)
                │
                └─1:1─► organizer_profiles (business info, approval status)

event_categories
    │
    └─1:N─► events ◄─── organizer_id (profiles)
                │
                ├─1:N─► bookings ◄─── user_id (profiles)
                ├─1:N─► comments ◄─── user_id (profiles)  [self-ref parent_id]
                ├─1:N─► tips     ◄─── user_id (profiles)
                └─1:N─► event_views ◄─ user_id (profiles, nullable)

profiles
    └─1:N─► notifications
    └─1:N─► device_tokens
    └─1:N─► global_chat
```

## Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User public info + role | `id`, `role`, `gender`, `city` |
| `organizer_profiles` | Organizer business details | `user_id`, `status`, `verified` |
| `event_categories` | Bilingual categories | `name_en`, `name_ar` |
| `events` | Core event data | `organizer_id`, `start_at`, `capacity`, `gender_restriction` |
| `bookings` | User–event registrations | `user_id`, `event_id`, `status` |
| `tips` | Organizer tips (mock MVP) | `user_id`, `event_id`, `amount` |
| `comments` | Threaded event comments | `event_id`, `parent_id`, `mentions[]` |
| `comment_reports` | Moderation reports | `comment_id`, `reporter_id`, `reason` |
| `global_chat` | Platform-wide chat feed | `user_id`, `content`, `mentions[]` |
| `notifications` | In-app notification inbox | `user_id`, `type`, `payload`, `is_read` |
| `device_tokens` | FCM push tokens | `user_id`, `token`, `platform` |
| `event_views` | Analytics: page views | `event_id`, `user_id` |

## Business Logic (enforced at DB level)

- **Capacity guard** — trigger on `bookings` INSERT raises exception when `bookings_count >= capacity`
- **Duplicate booking** — trigger + UNIQUE constraint prevents same user booking same event twice
- **Denormalized counters** — `events.bookings_count`, `events.views_count`, `events.tips_total` updated via triggers (avoids COUNT(*) on every read)
- **Role escalation prevention** — RLS prevents users from upgrading their own `role`
- **Organizer self-approval prevention** — RLS prevents organizers from changing their own `status` or `verified` fields
- **Auto profile creation** — trigger on `auth.users` INSERT creates matching `profiles` row

## RLS Summary

| Table | Anon | Auth User | Organizer | Admin |
|-------|------|-----------|-----------|-------|
| `profiles` | Read | Read + Update own | Read + Update own | Full |
| `organizer_profiles` | Read | — | Read + Update own | Full |
| `events` | Read published | Read published | Read own + Write own | Full |
| `bookings` | — | Read/Write own | Read event's bookings | Full |
| `tips` | — | Read/Write own | Read received | Full |
| `comments` | Read | Read + Insert + Soft-delete own | + Moderate on own events | Full |
| `notifications` | — | Read/Update own | Read/Update own | Full |
| `device_tokens` | — | Full own | Full own | Full |
| `global_chat` | Read | Read + Insert | Read + Insert | Full |

## Indexes

All foreign keys are indexed. Additional indexes on:
- `events`: composite feed index, PostGIS spatial index, full-text search GIN index
- `comments`: GIN on `mentions[]`
- `notifications`: partial index on unread notifications
- `device_tokens`: partial index on active tokens
