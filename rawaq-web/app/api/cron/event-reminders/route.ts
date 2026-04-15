import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendNotifications } from "@/lib/notifications";
import { ok, handleApiError } from "@/lib/errors";

// GET /api/cron/event-reminders
// Called every minute by your cron scheduler (Vercel Cron, cron-job.org, etc.)
// Protected by CRON_SECRET — set this env var and pass it as Bearer token.
//
// Vercel cron config (vercel.json):
// {
//   "crons": [{ "path": "/api/cron/event-reminders", "schedule": "* * * * *" }]
// }
//
// cron-job.org: set URL to https://yourapp.com/api/cron/event-reminders
// with header Authorization: Bearer <CRON_SECRET> — every 1 minute.

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const auth = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET;
    if (secret && auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const now = new Date();

    // ── 1-hour reminder window: 55-65 min from now ─────────────────────────
    const h1From = new Date(now.getTime() + 55 * 60 * 1000).toISOString();
    const h1To = new Date(now.getTime() + 65 * 60 * 1000).toISOString();

    // ── 24-hour reminder window: 23h55m - 24h05m from now ──────────────────
    const h24From = new Date(
      now.getTime() + (24 * 60 - 5) * 60 * 1000,
    ).toISOString();
    const h24To = new Date(
      now.getTime() + (24 * 60 + 5) * 60 * 1000,
    ).toISOString();

    const [{ data: h1Events }, { data: h24Events }] = await Promise.all([
      supabase
        .from("events")
        .select("id, title, start_at")
        .eq("is_published", true)
        .eq("is_cancelled", false)
        .gte("start_at", h1From)
        .lte("start_at", h1To),
      supabase
        .from("events")
        .select("id, title, start_at")
        .eq("is_published", true)
        .eq("is_cancelled", false)
        .gte("start_at", h24From)
        .lte("start_at", h24To),
    ]);

    let sent = 0;

    async function notifyAttendees(
      events: Array<{ id: string; title: string; start_at: string }>,
      body: string,
    ) {
      for (const event of events) {
        const { data: bookings } = await supabase
          .from("bookings")
          .select("user_id")
          .eq("event_id", event.id)
          .eq("status", "confirmed");

        if (!bookings?.length) continue;

        await sendNotifications(
          bookings.map((b) => ({
            userId: b.user_id,
            type: "event_reminder" as const,
            payload: {
              event_id: event.id,
              event_title: event.title,
              start_at: event.start_at,
              reminder: body,
            },
          })),
        );

        sent += bookings.length;
      }
    }

    await Promise.all([
      notifyAttendees(h1Events ?? [], "1 hour"),
      notifyAttendees(h24Events ?? [], "24 hours"),
    ]);

    return ok({
      sent,
      h1_events: (h1Events ?? []).length,
      h24_events: (h24Events ?? []).length,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
