# Plan Specs Enrichment — Design

**Date:** 2026-05-07
**Status:** Approved

---

## Problem

`PlanSelector.tsx` hardcodes the feature list shown on each plan card. Two issues:

1. **Missing specs** — `featured_per_month` exists in the DB and is enforced by the API but is never shown to the organizer on the plans page.
2. **Blank individual host plans** — `ind_free`, `ind_basic`, `ind_pro` have no entries in `PLAN_FEATURES` / `PLAN_FEATURES_AR`, so individual hosts see an empty feature list.

---

## Approach

Enrich the hardcoded `PLAN_FEATURES` and `PLAN_FEATURES_AR` arrays in `PlanSelector.tsx`. This stays consistent with the existing pattern. No architecture change needed.

---

## Feature Strings (approved)

### Company Organizer Plans

**org_basic**
- 5 events published per month
- Up to 50 attendees per event
- Basic analytics dashboard
- No featured events
- Organizer dashboard access
- 10% platform fee on revenue

**org_pro** (flagship)
- 20 events published per month
- Up to 200 attendees per event
- Full analytics dashboard
- Ticket scanner access
- 3 featured events per month
- 6% platform fee on revenue

**org_elite**
- Unlimited events published
- Unlimited attendees per event
- Full analytics + data export
- Ticket scanner access
- 3 featured events per month
- Priority support
- Custom branding
- 3% platform fee on revenue

### Individual Host Plans

**ind_free**
- 5 sessions per month
- Up to 30 attendees per session
- Free sessions only
- No featured sessions
- 15% platform fee on revenue
- 7-day payout hold

**ind_basic**
- 15 sessions per month
- Up to 60 attendees per session
- Free & paid sessions
- No featured sessions
- 12% platform fee on revenue
- 3-day payout hold

**ind_pro**
- 40 sessions per month
- Up to 100 attendees per session
- Free & paid sessions
- 1 featured session per month
- 8% platform fee on revenue
- 1-day payout hold

---

## Files Changed

- `rawaq-web/components/plans/PlanSelector.tsx` — update `PLAN_FEATURES` and `PLAN_FEATURES_AR` arrays
