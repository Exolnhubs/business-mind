import { NextRequest } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { ok, handleApiError } from "@/lib/errors"

// GET /api/cron/cancel-pending-bookings
// Called every hour to cancel stale pending bookings (15+ min old)
// This frees up spots so users can rebook

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const auth = req.headers.get("authorization") ?? ""
    const secret = process.env.CRON_SECRET
    if (secret && auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 })
    }

    const supabase = createSupabaseAdminClient()
    const now = new Date()

    // Cancel pending bookings older than 15 minutes
    const cutoff = new Date(now.getTime() - 15 * 60 * 1000).toISOString()

    // Find stale pending bookings
    const { data: staleBookings, error: fetchError } = await supabase
      .from("bookings")
      .select("id")
      .eq("status", "pending")
      .lt("created_at", cutoff)

    if (fetchError) throw fetchError

    if (!staleBookings?.length) {
      return ok({ cancelled: 0, message: "No stale pending bookings" })
    }

    // Cancel each stale booking
    const bookingIds = staleBookings.map((b) => b.id)
    // Bulk update bookings to cancelled
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: now.toISOString(),
        cancelled_reason: "Payment timeout - auto-cancelled by system",
      })
      .in("id", bookingIds)

    if (updateError) throw updateError

    return ok({
      cancelled: bookingIds.length,
      message: `Cancelled ${bookingIds.length} stale pending booking(s)`,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
