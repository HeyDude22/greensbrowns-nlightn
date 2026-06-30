import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/razorpay";

/**
 * Razorpay webhook for one-off pickup payments.
 *
 * Source of truth for payment outcome. Signature-verified over the raw body.
 * All status updates are guarded (only act on a 'quoted' payment) so repeated
 * deliveries are idempotent and a stale/cancelled link can't flip a pickup.
 *
 * Subscribed events: payment_link.paid, payment_link.cancelled,
 * payment_link.expired, payment.failed.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[Razorpay webhook] signature verification failed — rejecting");
    return new NextResponse("Forbidden", { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const event = body.event as string | undefined;
  const payload = body.payload as Record<string, unknown> | undefined;
  if (!event || !payload) {
    return NextResponse.json({ ok: true });
  }

  const paymentLink = (payload.payment_link as Record<string, unknown>)
    ?.entity as Record<string, unknown> | undefined;
  const payment = (payload.payment as Record<string, unknown>)?.entity as
    | Record<string, unknown>
    | undefined;

  const linkId = paymentLink?.id as string | undefined;
  const paymentId = payment?.id as string | undefined;

  const admin = createAdminClient();

  try {
    switch (event) {
      case "payment_link.paid": {
        if (!linkId) return NextResponse.json({ ok: true });

        // Idempotent + guarded: only a 'quoted' payment becomes 'paid'.
        const { data: updated, error } = await admin
          .from("payments")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            razorpay_payment_id: paymentId ?? null,
            failure_reason: null,
          })
          .eq("razorpay_payment_link_id", linkId)
          .eq("status", "quoted")
          .select("pickup_id");

        if (error) {
          console.error("[Razorpay webhook] payment update failed", error);
          return new NextResponse("error", { status: 500 });
        }
        if (!updated || updated.length === 0) {
          // Already processed, or link not found — ack so Razorpay stops retrying.
          return NextResponse.json({ ok: true });
        }

        const pickupId = updated[0].pickup_id as string;

        // Flip the pickup into the normal pipeline (requested -> verified).
        await admin
          .from("pickups")
          .update({ status: "verified" })
          .eq("id", pickupId)
          .eq("status", "requested");

        await admin.from("pickup_events").insert({
          pickup_id: pickupId,
          status: "verified",
          changed_by: null,
          notes: "Payment received via Razorpay; pickup verified",
        });

        return NextResponse.json({ ok: true });
      }

      case "payment_link.cancelled":
      case "payment_link.expired":
      case "payment.failed": {
        const failureReason =
          (payment?.error_description as string | undefined) ??
          event.replace("payment_link.", "link_").replace("payment.", "");

        // For payment.failed we may only have the payment entity; fall back to
        // the notes.pickup_id we set when creating the link.
        let query = admin
          .from("payments")
          .update({ status: "failed", failure_reason: failureReason })
          .eq("status", "quoted");

        if (linkId) {
          query = query.eq("razorpay_payment_link_id", linkId);
        } else {
          const notes = (payment?.notes as Record<string, string>) ?? {};
          const notePickupId = notes.pickup_id;
          if (!notePickupId) return NextResponse.json({ ok: true });
          query = query.eq("pickup_id", notePickupId);
        }

        const { error } = await query;
        if (error) {
          console.error("[Razorpay webhook] failure update failed", error);
          return new NextResponse("error", { status: 500 });
        }
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ ok: true });
    }
  } catch (error) {
    console.error("[Razorpay webhook] handler error", error);
    return new NextResponse("error", { status: 500 });
  }
}
