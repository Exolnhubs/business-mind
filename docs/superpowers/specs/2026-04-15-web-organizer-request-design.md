# Web Profile: Become an Organizer Request

**Date:** 2026-04-15
**Status:** Approved
**Scope:** `rawaq-web/app/(app)/profile/page.tsx` only — no new routes, no new API

---

## Background

The mobile app's profile screen already has a "Become an Organizer" feature for regular users (`role === 'user'`). The web profile page is missing this entirely. The API endpoints (`GET` and `POST /api/organizer/request`) are already implemented and working.

---

## Goal

Add an inline expandable card to the web profile page that lets regular users apply to become an organizer, matching the mobile experience.

---

## Placement

After the `<PlanStatusCard>` block, before the Account Security card. Renders only when `profile?.role === 'user'`.

---

## Component Design

All changes are **inside `profile/page.tsx`**. No new files, no new routes.

### State additions

```ts
const [orgRequest, setOrgRequest] = useState<{
  id: string
  status: string
  business_name: string
} | null | undefined>(undefined)  // undefined = still loading

const [showOrgForm, setShowOrgForm]     = useState(false)
const [orgReqForm, setOrgReqForm]       = useState({ business_name: '', description: '' })
const [submittingOrgReq, setSubmittingOrgReq] = useState(false)
const [orgReqMsg, setOrgReqMsg]         = useState<{ ok: boolean; text: string } | null>(null)
```

### Data fetch

On mount (when `profile?.role === 'user'`), fetch `GET /api/organizer/request` and store result in `orgRequest`. If no record exists, the API returns `null` — leave `orgRequest` as `null`.

```ts
useEffect(() => {
  if (profile?.role !== 'user') return
  fetch('/api/organizer/request')
    .then((r) => r.json())
    .then(({ data }) => setOrgRequest(data ?? null))
}, [profile?.role])
```

### Submit handler

```ts
async function submitOrgRequest(e: FormEvent) {
  e.preventDefault()
  if (!orgReqForm.business_name.trim()) return
  setSubmittingOrgReq(true)
  setOrgReqMsg(null)
  const res = await fetch('/api/organizer/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_name: orgReqForm.business_name.trim(),
      description: orgReqForm.description.trim() || null,
    }),
  })
  if (res.ok) {
    const { data } = await res.json()
    setOrgRequest(data)
    setShowOrgForm(false)
    setOrgReqMsg({ ok: true, text: 'Request submitted! Our team will review it shortly.' })
  } else {
    const { error } = await res.json().catch(() => ({ error: null }))
    setOrgReqMsg({ ok: false, text: error ?? 'Failed to submit request.' })
  }
  setSubmittingOrgReq(false)
}
```

---

## Visual States

### 1. Loading (`orgRequest === undefined`)

Do not render the card. Avoids flash of the form for users who are already organizers.

### 2. No request or rejected (`orgRequest === null || orgRequest.status === 'rejected'`)

```
┌─────────────────────────────────────────────────┐
│ 🏢 Become an Organizer                          │
│ Host and manage your own events on Rawaq.       │
│ [if rejected]: Your previous application was    │
│ not approved — you may reapply.                 │
│                                         [Apply] │
└─────────────────────────────────────────────────┘
```

Clicking **Apply** sets `showOrgForm = true` and expands the inline form.

### 3. Inline form (expanded)

```
┌─────────────────────────────────────────────────┐
│ 🏢 Become an Organizer                          │
│ ...subtitle...                          [Cancel]│
│                                                 │
│ Business / Organizer Name *                     │
│ [______________________________]                │
│                                                 │
│ About your organization (optional)              │
│ [______________________________]                │
│ [______________________________]                │
│                                                 │
│ [error/success message if any]                  │
│                                                 │
│ [        Submit Request        ]                │
└─────────────────────────────────────────────────┘
```

- Business name: `required`, `minLength={2}`, `maxLength={120}`
- Description: `textarea`, optional, `maxLength={500}`
- Submit button disabled while submitting or when business name is empty
- Cancel link resets `showOrgForm = false` and clears `orgReqMsg`

### 4. Pending (`orgRequest?.status === 'pending'`)

```
┌─────────────────────────────────────────────────┐
│ 🏢 Become an Organizer                          │
│ ⏳ Application pending                          │
│ Under review — we'll notify you when approved.  │
└─────────────────────────────────────────────────┘
```

No form, no action button. The card is informational only.

---

## Styling

Use existing patterns from the file:
- Card wrapper: `card p-6`
- Headings: `text-base font-semibold text-gray-900`
- Body text: `text-sm text-gray-500`
- Inputs: `input` class
- Primary action: `btn-primary w-full`
- Secondary/cancel link: `text-sm text-gray-500 hover:text-gray-700`
- Feedback messages: `text-sm rounded-xl px-4 py-3` with `bg-green-50 text-green-700 border border-green-200` (ok) or `bg-red-50 text-red-700 border border-red-200` (error)
- Pending banner: `bg-amber-50 text-amber-700 border border-amber-200 rounded-xl px-4 py-3 text-sm`

---

## Error Handling

- API errors surface in `orgReqMsg` with `ok: false`
- Network failures caught with `.catch(() => ({ error: null }))` — same pattern used elsewhere in the file
- Validation is client-side (required, min/max length on input) + server-side (zod schema in the API route)

---

## What Is NOT in Scope

- No changes to the API (`/api/organizer/request` is complete)
- No changes to the mobile app
- No admin-side changes
- No email notification wiring (already handled server-side if configured)
- No new components, hooks, or files — all changes are inline in `profile/page.tsx`
