/**
 * POST /api/bookings/:id/refund
 *
 * Cancels a paid confirmed booking and automatically processes the refund
 * through the original payment gateway (Paymob or Stripe).
 *
 * Flow (refund-row-first ordering — money cannot move without a refund row):
 *   1. Validate booking ownership, status, gateway tx, refund window, no duplicate
 *   2. INSERT refund row (status='pending') as a write-ahead intent
 *   3. Call gateway refund (or simulated auto-complete)
 *   4a. Gateway success → update refund to 'completed', mark tx 'refunded',
 *       cancel booking, then notify user
 *   4b. Gateway failure → leave refund row at 'pending' (manual queue),
 *       leave booking confirmed for manual reconciliation
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, limiters } from "@/lib/rate-limit";
import {
  handleApiError,
  created,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from "@/lib/errors";
import { sendNotification } from "@/lib/notifications";
import { refundPaymob } from "@/lib/gateways/paymob";
import { refundStripe } from "@/lib/gateways/stripe-gw";

const RequestRefundSchema = z.object({
  user_note: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    await checkRateLimit(limiters.payments, ctx.userId);

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const input = RequestRefundSchema.parse(body);

    const admin = createSupabaseAdminClient();

    // ── 1. Load booking ───────────────────────────────────────────────────────
    const { data: booking, error: bookingErr } = await admin
      .from("bookings")
      .select(
        "id, user_id, event_id, status, ticket_type_id, created_at, event:events(id, title, title_ar, is_free)",
      )
      .eq("id", id)
      .maybeSingle();

    if (bookingErr || !booking) throw new NotFoundException("Booking");
    if (booking.user_id !== ctx.userId) throw new ForbiddenException();
    if (booking.status !== "confirmed") {
      throw new BadRequestException("Only confirmed bookings can be refunded.");
    }

    // ── 1b. Enforce 24-hour refund window ─────────────────────────────────────
    const msPerHour = 60 * 60 * 1000;
    const hoursSinceBooking =
      (Date.now() - new Date(booking.created_at).getTime()) / msPerHour;
    if (hoursSinceBooking > 24) {
      throw new BadRequestException(
        "Refunds are only available within 24 hours of booking. The refund window for this ticket has closed.",
      );
    }

    const event = booking.event as unknown as {
      id: string;
      title: string;
      title_ar: string | null;
      is_free: boolean;
    } | null;
    if (event?.is_free) {
      throw new BadRequestException(
        "Free bookings cannot be refunded — just cancel instead.",
      );
    }

    // ── 2. Find succeeded payment transaction ─────────────────────────────────
    const { data: tx } = await admin
      .from("payment_transactions")
      .select(
        "id, amount, organizer_net, currency, status, gateway, gateway_ref, is_simulated, organizer_id",
      )
      .eq("booking_id", id)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tx) {
      throw new BadRequestException(
        "No completed payment found for this booking.",
      );
    }

    // ── 3. Guard duplicate ────────────────────────────────────────────────────
    const { data: existing } = await admin
      .from("refunds")
      .select("id, status")
      .eq("booking_id", id)
      .not("status", "eq", "rejected")
      .maybeSingle();

    if (existing) {
      throw new BadRequestException(
        existing.status === "completed"
          ? "This booking has already been refunded."
          : "A refund request is already in progress for this booking.",
      );
    }

    // Determine whether auto-refund is even possible at the gateway level.
    const gatewaySupportsAutoRefund =
      !tx.is_simulated &&
      !!tx.gateway_ref &&
      (tx.gateway === "paymob" || tx.gateway === "fawry" || tx.gateway === "stripe");

    // Simulated transactions are auto-completed without a gateway call.
    const isSimulatedAutoComplete = tx.is_simulated;

    // refund_method is decided up-front based on whether auto-refund will run.
    // 'original_payment' implies money will move via the gateway.
    // 'manual' implies it will be queued for admin processing.
    const refundMethod: "original_payment" | "manual" =
      gatewaySupportsAutoRefund || isSimulatedAutoComplete
        ? "original_payment"
        : "manual";

    // ── 4. Insert refund row as write-ahead intent (status: 'pending') ───────
    // This MUST happen before any money moves so that a gateway-side success
    // followed by a DB outage cannot leave us with a paid-out refund and no
    // record of it.
    const { data: pendingRefund, error: refundInsertErr } = await admin
      .from("refunds")
      .insert({
        payment_transaction_id: tx.id,
        booking_id: id,
        requested_by: ctx.userId,
        amount: tx.amount,
        user_note: input.user_note ?? null,
        status: "pending",
        refund_method: refundMethod,
        gateway_ref: null,
        processed_at: null,
        is_simulated: tx.is_simulated,
      })
      .select()
      .single();

    if (refundInsertErr) throw refundInsertErr;

    // ── 5. Attempt automatic gateway refund (or simulated auto-complete) ─────
    let refundSucceeded = false;
    let gatewayRefundRef: string | null = null;
    let autoRefundError: string | null = null;

    if (isSimulatedAutoComplete) {
      refundSucceeded = true;
      gatewayRefundRef = `sim_refund_${Date.now()}`;
    } else if (gatewaySupportsAutoRefund) {
      let result: {
        success: boolean;
        gatewayRefundRef?: string;
        error?: string;
      };

      try {
        if (tx.gateway === "paymob" || tx.gateway === "fawry") {
          result = await refundPaymob(tx.gateway_ref as string, tx.amount);
        } else {
          // stripe — checked above
          result = await refundStripe(tx.gateway_ref as string, tx.amount);
        }
      } catch (gatewayErr) {
        // Treat a thrown gateway error as a failed refund — leave row pending.
        Sentry.captureException(gatewayErr, {
          extra: {
            bookingId: id,
            txId: tx.id,
            refundId: pendingRefund.id,
            gateway: tx.gateway,
            stage: "gateway_refund_threw",
          },
        });
        result = {
          success: false,
          error: gatewayErr instanceof Error ? gatewayErr.message : "Gateway error",
        };
      }

      if (result.success) {
        refundSucceeded = true;
        gatewayRefundRef = result.gatewayRefundRef ?? null;
      } else {
        autoRefundError = result.error ?? null;
        Sentry.captureException(
          new Error("[bookings/refund] Gateway refund failed"),
          {
            extra: {
              bookingId: id,
              txId: tx.id,
              refundId: pendingRefund.id,
              gateway: tx.gateway,
              autoRefundError,
            },
          },
        );
        console.error(
          "[bookings/refund] Gateway refund failed, leaving in manual queue:",
          autoRefundError,
          "bookingId:",
          id,
          "txId:",
          tx.id,
          "refundId:",
          pendingRefund.id,
        );
      }
    }
    // else: manual queue — refund row already inserted as 'pending'.

    // ── 6. On success: complete refund row, mark tx refunded, cancel booking ─
    let finalRefund = pendingRefund;

    if (refundSucceeded) {
      const nowIso = new Date().toISOString();

      const { data: completed, error: completeErr } = await admin
        .from("refunds")
        .update({
          status: "completed",
          gateway_ref: gatewayRefundRef,
          processed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", pendingRefund.id)
        .select()
        .single();

      if (completeErr) {
        // Money has already moved at the gateway. Refund row stays 'pending'
        // and the booking stays confirmed; admin reconciliation needed.
        Sentry.captureException(completeErr, {
          extra: {
            bookingId: id,
            txId: tx.id,
            refundId: pendingRefund.id,
            gatewayRefundRef,
            stage: "refund_row_complete_failed_after_gateway_success",
          },
        });
        throw completeErr;
      }

      finalRefund = completed;

      // Mark transaction as refunded — triggers organizer wallet debit.
      const { error: txErr } = await admin
        .from("payment_transactions")
        .update({ status: "refunded", updated_at: nowIso })
        .eq("id", tx.id);

      if (txErr) {
        // Non-fatal: refund row already 'completed', wallet sync may be missed.
        Sentry.captureException(txErr, {
          extra: {
            bookingId: id,
            txId: tx.id,
            refundId: pendingRefund.id,
            stage: "tx_refunded_update_failed",
          },
        });
        console.error(
          "[bookings/refund] Failed to mark tx as refunded:",
          txErr.message,
          "txId:",
          tx.id,
        );
      }

      // Cancel the booking — capacity decrement is triggered by this.
      const { error: cancelErr } = await admin
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", id);

      if (cancelErr) {
        // Non-fatal: refund row is complete, money moved. Booking cancellation
        // is a derived state that admin can fix manually.
        Sentry.captureException(cancelErr, {
          extra: {
            bookingId: id,
            txId: tx.id,
            refundId: pendingRefund.id,
            stage: "booking_cancel_failed_after_refund",
          },
        });
        console.error(
          "[bookings/refund] Failed to cancel booking after successful refund:",
          (cancelErr as { message?: string }).message,
          "bookingId:",
          id,
        );
      }
    }
    // else: refund row stays 'pending', booking stays 'confirmed' for manual
    //       review. No capacity decrement, no money movement at our side.

    // ── 7. Notify user ────────────────────────────────────────────────────────
    if (refundSucceeded) {
      sendNotification({
        userId: ctx.userId,
        type: "booking_cancelled",
        payload: {
          booking_id: id,
          event_id: booking.event_id,
          event_title: event?.title ?? "",
        },
      }).catch(() => {});
    }

    return created({
      refund: finalRefund,
      auto_refunded: refundSucceeded && !tx.is_simulated,
      message: refundSucceeded
        ? "Your ticket has been cancelled and the refund has been processed to your original payment method."
        : "Your refund request has been received. It is queued for manual processing and will be completed within 1-3 business days.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
