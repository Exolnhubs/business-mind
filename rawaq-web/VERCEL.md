# Vercel configuration

Vercel only ever reads the file named **`vercel.json`**. There is no way to
select a config by plan, and `vercel.json` cannot hold comments or unknown
top-level keys (it is validated as strict JSON), so the two configs are kept as
separate files and documented here.

| File | Plan | Crons |
|------|------|-------|
| **`vercel.json`** | **Production (Vercel Pro)** — active config | 3 crons at sub-hour frequency (event-reminders `* * * * *`, cancel-pending-bookings `*/10 * * * *`, keep-warm `*/3 * * * *`) |
| `vercel.hobby.json` | Test / Hobby plan | 2 crons at daily granularity (cancel-pending-bookings `0 3 * * *`, event-reminders `0 4 * * *`) |

## Why a separate Hobby file

The Vercel **Hobby** plan limits cron jobs to **at most 2** and to **daily
granularity only** — the production sub-hour schedules are rejected on Hobby,
and `keep-warm` is dropped to stay within the 2-cron cap. These daily crons are
effectively placeholders so a Hobby deploy succeeds; they do **not** give the
real cadence the app needs.

For true frequency on a Hobby test deploy, drive the endpoints from an external
scheduler (e.g. cron-job.org) hitting them with the `CRON_SECRET` header:

- `/api/cron/event-reminders` — every minute
- `/api/cron/cancel-pending-bookings` — every 10 minutes
- `/api/cron/keep-warm` — every 3 minutes

## Using the Hobby config for a test deploy

`vercel.json` must remain the production config. To deploy to a Hobby project,
overwrite it locally just before deploying and restore it afterward:

```bash
cp vercel.hobby.json vercel.json   # use Hobby crons for the test deploy
# ... deploy to the Hobby project ...
git checkout vercel.json           # restore the production config
```

Do not commit the Hobby crons over `vercel.json`.
