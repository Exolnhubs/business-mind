# Mobile OTA Updates - Feature Spec

**Date:** 2026-05-04
**Status:** Ready for implementation planning

---

## 1. Purpose

Rawaq Mobile is close to going live, but the current release workflow makes every small change feel native-heavy: a UI polish pass, a localization typo, or a tiny component edit requires producing a new build and pushing that build to devices.

This spec introduces **over-the-air updates** for the Expo mobile app using EAS Update. The goal is to separate small JavaScript/assets changes from native binary releases, so Rawaq can ship daily product polish without making users reinstall or wait for store review.

The product gain: Rawaq can move faster after launch while still keeping native changes controlled, reviewable, and store-compliant.

---

## 2. Current State

### 2.1 App state

- App: `rawaq-mobile`
- Framework: Expo SDK 54, React Native 0.81, React 19
- Build config: `rawaq-mobile/eas.json`
- App config: `rawaq-mobile/app.json`
- Current build profiles: `development`, `preview`, `production`
- Current usage: development and preview builds only. No production users yet.

### 2.2 OTA state

The app is not currently configured for EAS Update:

- No `expo-updates` dependency in `rawaq-mobile/package.json`
- No `expo.updates.url` in `app.json`
- No top-level `runtimeVersion` policy in `app.json`
- No `channel` values in `eas.json`

This is a good point to add OTA because there are no live production users whose installed binary compatibility needs to be migrated.

---

## 3. Product Decision

### Decision

Use **Expo EAS Update** as the official OTA update layer for `rawaq-mobile`.

### Why this is the right fit

- Rawaq Mobile already uses Expo and EAS project metadata.
- The most common pain point is non-native change delivery: UI, text, localization, and JS behavior.
- EAS Update is the market-standard OTA path for Expo apps.
- It supports channels, runtime compatibility, rollbacks, rollouts, and dashboard visibility.
- It avoids adding a second update service or custom update server before launch.

### Non-goal

OTA updates are not a replacement for native app releases. They are a faster lane for compatible JavaScript, styling, and asset updates.

---

## 4. Mental Model

### 4.1 Native layer vs update layer

Every installed mobile app has two layers:

| Layer | Lives where | Updated by | Examples |
|---|---|---|---|
| Native binary layer | App Store / Play Store build | New build | Native modules, permissions, SDK upgrades, native splash config, app icon |
| Update layer | EAS Update | OTA publish | JS/TS code, UI, localization strings, styles, bundled assets |

An OTA update can only run on devices whose native binary layer is compatible with that update.

This compatibility is controlled by `runtimeVersion`.

### 4.2 Runtime version

`runtimeVersion` is the contract between a binary and an OTA update.

If a device has runtime version `1.0.0`, it should only receive updates published for runtime `1.0.0`. If native code changes, the runtime must change, forcing a new build.

Expo supports several policies:

| Policy | Meaning | Fit for Rawaq |
|---|---|---|
| `appVersion` | Runtime follows `expo.version` | Simple, clear release model |
| `nativeVersion` | Runtime follows app version plus native build number | More precise but noisier |
| `fingerprint` | Runtime changes when native-impacting files change | Safest, more automatic |
| Manual string | Team manually controls runtime | Flexible, easy to forget |

### Recommended policy

Use:

```json
"runtimeVersion": {
  "policy": "appVersion"
}
```

Reason: Rawaq is pre-production and already has a product-release rhythm. The rule is easy to teach:

- UI/localization/JS fix: publish OTA.
- Native dependency/config/SDK change: bump `expo.version`, create a new build.

If the team wants stricter automatic compatibility later, it can move to `fingerprint` before or after first production release.

---

## 5. Channel Model

Use EAS Update channels to separate audiences.

| Channel | Audience | Build profile | Purpose |
|---|---|---|---|
| `development` | Developers | `development` | Dev-client testing and debugging |
| `preview` | Internal testers | `preview` | QA, stakeholder review, release candidates |
| `production` | Store users | `production` | Live users after launch |

### Release rule

An update published to `preview` must never affect production users.

An update published to `production` must only happen after:

- Type-check passes.
- App smoke test passes.
- The same change has been verified through preview when practical.

---

## 6. What Can Be Updated OTA

OTA is appropriate for:

- UI component edits
- Localization copy changes
- Screen layout and style changes
- Bug fixes in JS/TS code
- React Navigation / Expo Router screen behavior
- API URL usage and request/response handling
- Bundled images and static assets
- Feature flags and non-native config

OTA is not appropriate for:

- Adding or upgrading native dependencies
- Changing native permissions
- Changing bundle identifier or Android package name
- Changing app icon, adaptive icon, or native splash config
- Expo SDK upgrades
- Native Android/iOS project changes
- New capabilities that require native modules not already inside the installed binary

---

## 7. Update UX Decision

### Default launch behavior

Use Expo's default `ON_LOAD` behavior initially:

- App checks for updates when opened.
- If a newer compatible update exists, it downloads in the background.
- The update normally applies on the next restart.

This is the lowest-risk live behavior because it avoids surprising users with a mid-session reload.

### Later enhancement

After launch, add a small in-app update manager:

- If an update is downloaded, show a quiet toast or modal: "A fresh version is ready."
- User taps "Restart" to apply it.
- Critical hotfixes may force reload after a safe screen boundary.

This enhancement is optional for the first OTA implementation.

---

## 8. Operational Workflow

### Small update

Example: localization word, card spacing, button label.

```bash
cd rawaq-mobile
npm run type-check
eas update --channel preview --message "Fix Arabic community copy"
```

After QA:

```bash
eas update --channel production --message "Fix Arabic community copy"
```

### Native update

Example: add a native package, change permissions, upgrade Expo SDK.

```bash
cd rawaq-mobile
# bump expo.version in app.json
eas build --profile preview --platform android
eas build --profile preview --platform ios
```

After store release, OTA updates can target that new runtime.

---

## 9. Risk Model

### Main risk: incompatible update

Publishing JS that expects a native module not present in the installed app can crash or fail. `runtimeVersion` reduces this risk by making updates target only compatible binaries.

### Main process protection

- Never publish OTA after native dependency or config changes.
- Bump app version and rebuild when native layer changes.
- Test in `preview` before `production`.
- Keep update messages descriptive.
- Use EAS dashboard to inspect deployed update groups.

### Store policy posture

OTA should be used for bug fixes, UI, text, and non-native behavior changes. It should not be used to hide materially different app functionality from review or bypass app store rules.

---

## 10. Implementation Scope

### In scope

- Install/configure `expo-updates`
- Add EAS Update URL to `app.json`
- Add `runtimeVersion` policy
- Add update channels to `eas.json`
- Confirm native splash still works with updates
- Create preview and production update commands
- Add package scripts for repeatable update publishing
- Document team workflow
- Verify with a preview build before production use

### Out of scope

- Custom update server
- Forced-update modal
- CodePush migration
- Production store release
- CI automation
- EAS rollout automation
- Runtime migration for already-live users

These can be added after the basic OTA lane is stable.

---

## 11. Success Signals

- A localization-only change can reach a preview build without rebuilding.
- A UI-only change can reach a preview build without rebuilding.
- Preview channel updates do not affect production channel builds.
- Production build can be created with OTA enabled before first public launch.
- Team can clearly answer: "Does this change need a rebuild or OTA?"

---

## 12. References

- Expo EAS Update introduction: https://docs.expo.dev/eas-update/introduction/
- Expo EAS Update getting started: https://docs.expo.dev/eas-update/getting-started/
- Expo runtime versions: https://docs.expo.dev/eas-update/runtime-versions/
- Expo Updates SDK API: https://docs.expo.dev/versions/latest/sdk/updates/
