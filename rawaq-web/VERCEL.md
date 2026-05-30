# Vercel configuration

Vercel only reads the file named **`vercel.json`**. There is no way to select a
config by plan, and `vercel.json` cannot hold comments or unknown top-level keys
because it is validated as strict JSON. The deployable Hobby config is active,
and the Pro production config is kept as a separate file for the go-live switch.

| File | Plan | Crons |
|------|------|-------|
| **`vercel.json`** | **Hobby plan** - active config | 2 crons at daily granularity (cancel-pending-bookings `0 3 * * *`, event-reminders `0 4 * * *`) |
| `vercel.hobby.json` | Hobby plan backup | Same as `vercel.json` |
| `vercel.production.json` | Production (Vercel Pro) | 3 crons at sub-hour frequency (event-reminders `* * * * *`, cancel-pending-bookings `*/10 * * * *`, keep-warm `*/3 * * * *`) |

## Why the active config is Hobby-safe

The Vercel **Hobby** plan limits cron jobs to **at most 2** and to **daily
granularity only**. The production sub-hour schedules are rejected on Hobby, and
`keep-warm` is dropped to stay within the 2-cron cap. These daily crons are
effectively placeholders so a Hobby deploy succeeds; they do **not** give the
real cadence the app needs.

For true frequency on a Hobby deploy, drive the endpoints from an external
scheduler (e.g. cron-job.org) hitting them with the `CRON_SECRET` header:

- `/api/cron/event-reminders` - every minute
- `/api/cron/cancel-pending-bookings` - every 10 minutes
- `/api/cron/keep-warm` - every 3 minutes

## Switching to the Pro production config

When the project moves to a Pro plan, copy the production config over the active
config and commit that change:

```bash
cp vercel.production.json vercel.json
```
