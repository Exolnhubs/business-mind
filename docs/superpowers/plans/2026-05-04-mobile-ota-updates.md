# Mobile OTA Updates - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure `rawaq-mobile` for Expo EAS Update so UI, localization, JS, and asset changes can be shipped over the air without rebuilding, while native changes still require proper preview/production builds.

**Architecture:** EAS Update with explicit channels (`development`, `preview`, `production`) and an `appVersion` runtime policy. The native binary carries the runtime and update URL. OTA publishes JS/assets to a channel that only matching builds can consume.

**Tech Stack:** Expo SDK 54, EAS Build, EAS Update, `expo-updates`, Expo Router, React Native.

**Spec:** `docs/superpowers/specs/2026-05-04-mobile-ota-updates-design.md` - read this before implementing any task.

---

## Phase 1 - Configure EAS Update Foundation

> This phase changes update infrastructure only. It does not create a production store build.

---

### Task 1: Install `expo-updates`

**Files:**
- Modify: `rawaq-mobile/package.json`
- Modify: `rawaq-mobile/package-lock.json`

- [ ] **Step 1: Install the Expo-compatible package**

```bash
cd rawaq-mobile
npx expo install expo-updates
```

Expected:

- `expo-updates` is added to dependencies.
- Lockfile updates are generated.
- No unrelated dependency churn.

- [ ] **Step 2: Verify dependency is present**

```bash
npm ls expo-updates
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-mobile/package.json rawaq-mobile/package-lock.json
git commit -m "feat(mobile): install expo updates"
```

---

### Task 2: Configure EAS Update in `app.json`

**Files:**
- Modify: `rawaq-mobile/app.json`

- [ ] **Step 1: Run EAS update configure**

```bash
cd rawaq-mobile
eas update:configure
```

Expected:

- Adds `expo.updates.url`.
- Adds `expo.runtimeVersion`.
- Keeps existing `extra.eas.projectId`.

Current project id already exists:

```json
"projectId": "dc8a87d8-1ea8-4454-967a-45fc86201786"
```

- [ ] **Step 2: Normalize runtime policy**

Ensure `app.json` contains:

```json
"runtimeVersion": {
  "policy": "appVersion"
}
```

Ensure `updates.url` points to:

```json
"updates": {
  "url": "https://u.expo.dev/dc8a87d8-1ea8-4454-967a-45fc86201786"
}
```

- [ ] **Step 3: Keep native splash config unchanged**

Confirm the recently migrated splash background remains:

```json
"splash": {
  "backgroundColor": "#080604"
}
```

- [ ] **Step 4: Validate config**

```bash
npx expo config --type public
```

- [ ] **Step 5: Commit**

```bash
git add rawaq-mobile/app.json
git commit -m "feat(mobile): configure eas update runtime"
```

---

## Phase 2 - Channel Separation

---

### Task 3: Add EAS update channels to build profiles

**Files:**
- Modify: `rawaq-mobile/eas.json`

- [ ] **Step 1: Add channel names**

Update build profiles:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development"
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview"
    },
    "production": {
      "autoIncrement": true,
      "channel": "production"
    }
  }
}
```

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('eas.json','utf8')); console.log('ok')"
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-mobile/eas.json
git commit -m "feat(mobile): add eas update channels"
```

---

### Task 4: Add package scripts for update publishing

**Files:**
- Modify: `rawaq-mobile/package.json`

- [ ] **Step 1: Add scripts**

Add these scripts:

```json
"update:dev": "eas update --channel development",
"update:preview": "eas update --channel preview",
"update:production": "eas update --channel production"
```

Do not hide the `--message` requirement from the release process. The operator should still pass an explicit message:

```bash
npm run update:preview -- --message "Fix Arabic event card title"
```

- [ ] **Step 2: Validate package JSON**

```bash
npm pkg get scripts.update:preview
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-mobile/package.json
git commit -m "chore(mobile): add eas update publish scripts"
```

---

## Phase 3 - Preview Build Verification

> OTA config only affects builds created after the config exists. Existing preview/dev builds will not reliably receive the new update configuration.

---

### Task 5: Create a fresh preview build with OTA enabled

**Files:**
- No source file changes expected.

- [ ] **Step 1: Build preview Android**

```bash
cd rawaq-mobile
eas build --profile preview --platform android
```

- [ ] **Step 2: Build preview iOS if Apple credentials are ready**

```bash
eas build --profile preview --platform ios
```

- [ ] **Step 3: Install preview build on test device**

Use EAS dashboard, QR install, or internal distribution link.

- [ ] **Step 4: Smoke test app launch**

Verify:

- App launches.
- Animated splash completes.
- Auth flow appears or restores session.
- No immediate update-related crash.

- [ ] **Step 5: Record build ids in implementation notes**

Add a short note to the plan or release checklist with:

- Android build id
- iOS build id
- Profile: `preview`
- Channel: `preview`
- Runtime version: current `expo.version`

---

### Task 6: Publish a harmless preview OTA update

**Files:**
- Modify: one safe localization string or temporary test copy.
- Revert the test copy after verification if it is not desired.

- [ ] **Step 1: Make a tiny visible preview-only change**

Use a harmless copy or UI spacing change that can be visually verified.

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

- [ ] **Step 3: Publish to preview**

```bash
npm run update:preview -- --message "Verify OTA preview delivery"
```

- [ ] **Step 4: Test on device**

Close and reopen the preview app up to two times.

Expected:

- First open checks/downloads the update.
- Next restart applies the update.

- [ ] **Step 5: Commit or revert test change**

If the visible change is real, commit it.

If it was only a test marker, revert only that test marker.

---

## Phase 4 - Production Readiness

---

### Task 7: Add release workflow documentation

**Files:**
- Create: `rawaq-mobile/docs/ota-updates.md` or update an existing mobile release doc if one exists.

- [ ] **Step 1: Document the decision tree**

Include:

```text
Use OTA when:
- UI, text, localization, JS behavior, styles, bundled assets

Use a new build when:
- Native dependency, permissions, app icon, native splash, Expo SDK, package id
```

- [ ] **Step 2: Document publish commands**

Include:

```bash
npm run type-check
npm run update:preview -- --message "..."
npm run update:production -- --message "..."
```

- [ ] **Step 3: Document rollback basics**

Include a short note:

- Use EAS dashboard to inspect update groups.
- Republish the previous known-good commit to the same channel if rollback is needed.
- For serious native/runtime issues, ship a new build.

- [ ] **Step 4: Commit**

```bash
git add rawaq-mobile/docs/ota-updates.md
git commit -m "docs(mobile): document ota update workflow"
```

---

### Task 8: Create first production build after OTA config

**Files:**
- No source file changes expected unless version is intentionally bumped.

- [ ] **Step 1: Confirm production release version**

Check:

```json
"version": "1.0.0"
```

If this will be the first public production binary, keep or set the intended launch version before building.

- [ ] **Step 2: Build production Android**

```bash
eas build --profile production --platform android
```

- [ ] **Step 3: Build production iOS**

```bash
eas build --profile production --platform ios
```

- [ ] **Step 4: Submit when ready**

```bash
eas submit --profile production --platform android
eas submit --profile production --platform ios
```

This task is not required before preview OTA testing. It is required before live users can receive production OTA updates.

---

## Phase 5 - Optional Post-Launch Enhancement

---

### Task 9: Add in-app update status UX

**Files:**
- Modify: `rawaq-mobile/app/_layout.tsx`
- Create: `rawaq-mobile/components/updates/UpdateReadyToast.tsx`

- [ ] **Step 1: Add update hook**

Use `expo-updates` `useUpdates()` to detect downloaded updates.

- [ ] **Step 2: Show restart prompt only when safe**

When an update is pending:

- Show a small toast/banner.
- Button: "Restart"
- Call `Updates.reloadAsync()` after tap.

- [ ] **Step 3: Keep automatic reload off during active sessions**

Avoid forcing reload during booking/payment flows.

- [ ] **Step 4: Type-check and commit**

```bash
npm run type-check
git add rawaq-mobile/app/_layout.tsx rawaq-mobile/components/updates/UpdateReadyToast.tsx
git commit -m "feat(mobile): show update ready prompt"
```

---

## Self-Review

**Spec coverage:**

- [ ] EAS Update chosen as OTA provider
- [ ] Native/update layer mental model documented
- [ ] `expo-updates` installation planned
- [ ] `updates.url` planned
- [ ] `runtimeVersion` policy planned
- [ ] `development`, `preview`, and `production` channels planned
- [ ] Preview build verification included
- [ ] Production build requirement clearly separated
- [ ] OTA vs rebuild decision tree included
- [ ] Optional in-app update UX deferred

**Risk controls:**

- [ ] No existing production users, so no migration burden
- [ ] Preview channel verified before production
- [ ] Type-check before publishing update
- [ ] Native changes require new build
- [ ] Runtime policy guards compatibility

**Implementation discipline:**

- [ ] Commit after each phase/task as requested
- [ ] Do not stage unrelated working tree changes
- [ ] Use `const` for non-reassigned variables
- [ ] Avoid `any`; use explicit types or `unknown` when needed
