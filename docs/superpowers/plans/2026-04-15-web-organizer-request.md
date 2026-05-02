# Web Profile: Become an Organizer Request — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline expandable "Become an Organizer" card to the web profile page for regular users (`role === 'user'`), matching the mobile experience.

**Architecture:** All changes are confined to a single file — `rawaq-web/app/(app)/profile/page.tsx`. The API endpoints (`GET /api/organizer/request` and `POST /api/organizer/request`) are already complete. No new files, routes, or components needed.

**Tech Stack:** Next.js 15(App Router), React, TypeScript, Tailwind CSS, existing `btn-primary` / `input` / `card` CSS classes, `Spinner` component already imported.

---

## File Map

| File                                   | Change                                                      |
| -------------------------------------- | ----------------------------------------------------------- |
| `rawaq-web/app/(app)/profile/page.tsx` | Add 5 state vars, 1 useEffect, 1 async handler, 1 JSX block |

---

### Task 1: Add state variables and data-fetch effect

**Files:**

- Modify: `rawaq-web/app/(app)/profile/page.tsx`

- [ ] **Step 1: Add 5 new state variables**

Open `rawaq-web/app/(app)/profile/page.tsx`. Find the line:

```ts
const [loadingOrg, setLoadingOrg] = useState(false);
```

Add the following **immediately after** that line:

```ts
// Organizer request (for role === 'user')
const [orgRequest, setOrgRequest] = useState<
  | {
      id: string;
      status: string;
      business_name: string;
    }
  | null
  | undefined
>(undefined); // undefined = still loading
const [showOrgForm, setShowOrgForm] = useState(false);
const [orgReqForm, setOrgReqForm] = useState({
  business_name: "",
  description: "",
});
const [submittingOrgReq, setSubmittingOrgReq] = useState(false);
const [orgReqMsg, setOrgReqMsg] = useState<{
  ok: boolean;
  text: string;
} | null>(null);
```

- [ ] **Step 2: Add the fetch effect**

Find the existing organizer profile load effect:

```ts
  // Load organizer profile if applicable
  useEffect(() => {
    if (profile?.role !== 'organizer') return
```

Add the following **immediately before** that block:

```ts
// Fetch organizer request status for regular users
useEffect(() => {
  if (profile?.role !== "user") return;
  fetch("/api/organizer/request")
    .then((r) => r.json())
    .then(({ data }) => setOrgRequest(data ?? null));
}, [profile?.role]);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors related to the new state variables.

- [ ] **Step 4: Commit**

```bash
cd rawaq-web && git add app/\(app\)/profile/page.tsx
git commit -m "feat(web-profile): add organizer request state and data fetch"
```

---

### Task 2: Add submit handler

**Files:**

- Modify: `rawaq-web/app/(app)/profile/page.tsx`

- [ ] **Step 1: Add the submit function**

Find the closing brace of `handleEmailChange`:

```ts
  async function handleEmailChange(e: FormEvent) {
    ...
  }
```

Add the following **immediately after** that function (before the `const setP =` line):

```ts
async function submitOrgRequest(e: FormEvent) {
  e.preventDefault();
  if (!orgReqForm.business_name.trim()) return;
  setSubmittingOrgReq(true);
  setOrgReqMsg(null);
  const res = await fetch("/api/organizer/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_name: orgReqForm.business_name.trim(),
      description: orgReqForm.description.trim() || null,
    }),
  });
  if (res.ok) {
    const { data } = await res.json();
    setOrgRequest(data);
    setShowOrgForm(false);
    setOrgReqMsg(null);
  } else {
    const { error } = await res.json().catch(() => ({ error: null }));
    setOrgReqMsg({ ok: false, text: error ?? "Failed to submit request." });
  }
  setSubmittingOrgReq(false);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd rawaq-web && git add app/\(app\)/profile/page.tsx
git commit -m "feat(web-profile): add organizer request submit handler"
```

---

### Task 3: Add the JSX card

**Files:**

- Modify: `rawaq-web/app/(app)/profile/page.tsx`

- [ ] **Step 1: Insert the card after PlanStatusCard**

Find this exact comment + component line in the JSX:

```tsx
{
  /* ── My Plan ────────────────────────────────────────── */
}
<PlanStatusCard planId={profile?.plan_id ?? "user_free"} />;

{
  /* ── Account Security ───────────────────────────────── */
}
```

Replace it with:

```tsx
{
  /* ── My Plan ────────────────────────────────────────── */
}
<PlanStatusCard planId={profile?.plan_id ?? "user_free"} />;

{
  /* ── Become an Organizer ───────────────────────────── */
}
{
  profile?.role === "user" && orgRequest !== undefined && (
    <div className="card p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">
        🏢 Become an Organizer
      </h2>

      {orgRequest?.status === "pending" ? (
        <div className="bg-amber-50 text-amber-700 border border-amber-200 rounded-xl px-4 py-3 text-sm">
          ⏳ Application pending — under review. We&apos;ll notify you when
          approved.
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">
            {orgRequest?.status === "rejected"
              ? "Your previous application was not approved — you may reapply."
              : "Host and manage your own events on Rawaq."}
          </p>

          {!showOrgForm ? (
            <button
              type="button"
              onClick={() => {
                setShowOrgForm(true);
                setOrgReqMsg(null);
              }}
              className="btn-primary"
            >
              Apply
            </button>
          ) : (
            <form onSubmit={submitOrgRequest} className="space-y-4">
              <div>
                <label className="label">Business / Organizer Name *</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={orgReqForm.business_name}
                  onChange={(e) =>
                    setOrgReqForm((f) => ({
                      ...f,
                      business_name: e.target.value,
                    }))
                  }
                  className="input"
                  placeholder="e.g. Riyadh Sports Club"
                />
              </div>
              <div>
                <label className="label">
                  About your organization (optional)
                </label>
                <textarea
                  value={orgReqForm.description}
                  onChange={(e) =>
                    setOrgReqForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                  maxLength={500}
                  className="input resize-none"
                  placeholder="Describe what kind of events you organize…"
                />
              </div>
              {orgReqMsg && (
                <div
                  className={`text-sm rounded-xl px-4 py-3 ${
                    orgReqMsg.ok
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {orgReqMsg.text}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={
                    submittingOrgReq || !orgReqForm.business_name.trim()
                  }
                  className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingOrgReq ? <Spinner size="sm" /> : "Submit Request"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOrgForm(false);
                    setOrgReqMsg(null);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}

{
  /* ── Account Security ───────────────────────────────── */
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual verification checklist**

Start the dev server (`npm run dev` in `rawaq-web/`) and open `/profile` as a regular user (`role === 'user'`).

| Check                                                                     | Expected |
| ------------------------------------------------------------------------- | -------- |
| Card appears after "My Plan" section                                      | ✅       |
| Card shows "Host and manage your own events on Rawaq." subtitle           | ✅       |
| "Apply" button visible, form hidden                                       | ✅       |
| Click "Apply" → form expands                                              | ✅       |
| Submit with empty business name → button stays disabled                   | ✅       |
| Submit with valid name → card transitions to amber pending banner         | ✅       |
| Click "Cancel" → form collapses, Apply button returns                     | ✅       |
| Reload page as user with pending request → amber banner shows immediately | ✅       |
| Login as organizer (`role === 'organizer'`) → card is NOT shown           | ✅       |
| Login as admin (`role === 'admin'`) → card is NOT shown                   | ✅       |

- [ ] **Step 4: Final commit**

```bash
cd rawaq-web && git add app/\(app\)/profile/page.tsx
git commit -m "feat(web-profile): add become-an-organizer inline card for regular users"
```
