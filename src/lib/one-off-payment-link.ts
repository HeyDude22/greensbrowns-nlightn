/**
 * Payment link for a one-off (guest) pickup, created when the guest taps
 * Accept Quote on the bwg_quote_ready template (UAT-5).
 *
 * payments.status: quote_sent -> quoted (link sent). The link expires after
 * 24 hours; Razorpay's expired webhook then moves the payment to 'failed' and
 * the admin can resend the quote.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createPaymentLink,
  isRazorpayConfigured,
  razorpayCredentialDiagnostics,
} from "@/lib/razorpay";
import { sendBwgPaymentLinkWhatsApp } from "@/lib/whatsapp/notifications";

export const PAYMENT_LINK_VALID_HOURS = 24;

export type PaymentLinkResult =
  | { ok: true; shortUrl: string; amountRs: number }
  | { ok: false; reason: "not_awaiting_acceptance" | "not_configured" | "failed" };

/**
 * Claim the quote (quote_sent -> quoted), create a 24-hour Razorpay link and
 * send it on WhatsApp. The guarded claim makes a double tap a no-op; if the
 * link can't be created the quote goes back to quote_sent so the guest can
 * tap Accept Quote again.
 */
export async function acceptQuoteAndSendPaymentLink(
  admin: SupabaseClient,
  pickupId: string,
): Promise<PaymentLinkResult> {
  if (!isRazorpayConfigured()) {
    console.error("[quote accept] Razorpay is not configured");
    return { ok: false, reason: "not_configured" };
  }

  const { data: claimed, error: claimErr } = await admin
    .from("payments")
    .update({ status: "quoted", failure_reason: null })
    .eq("pickup_id", pickupId)
    .eq("status", "quote_sent")
    .select("id, quote_amount_rs");

  if (claimErr) {
    console.error("[quote accept] claim failed", { pickupId, claimErr });
    return { ok: false, reason: "failed" };
  }
  const payment = claimed?.[0];
  if (!payment) return { ok: false, reason: "not_awaiting_acceptance" };

  const revert = async () => {
    await admin
      .from("payments")
      .update({ status: "quote_sent" })
      .eq("id", payment.id)
      .eq("status", "quoted");
  };

  const amountRs = Number(payment.quote_amount_rs);
  const { data: pickup } = await admin
    .from("pickups")
    .select("id, pickup_number, guest_requests(requester_name, phone)")
    .eq("id", pickupId)
    .single();
  const guest = pickup?.guest_requests as unknown as {
    requester_name: string | null;
    phone: string | null;
  } | null;

  if (!pickup || !guest?.phone || !Number.isFinite(amountRs) || amountRs <= 0) {
    console.error("[quote accept] missing pickup, guest phone or amount", { pickupId });
    await revert();
    return { ok: false, reason: "failed" };
  }

  // reference_id must be unique per link; we reconcile via the link id + notes.
  const referenceId = `oneoff-${pickupId.slice(0, 8)}-${Date.now().toString(36)}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const expireBy = Math.floor(Date.now() / 1000) + PAYMENT_LINK_VALID_HOURS * 60 * 60;

  let link;
  try {
    link = await createPaymentLink({
      amountRs,
      referenceId,
      customerName: guest.requester_name ?? "GreensBrowns Customer",
      customerPhone: guest.phone,
      description: `GreensBrowns one-off pickup ${pickup.pickup_number ?? pickupId}`,
      callbackUrl: appUrl ? `${appUrl}/payment-status` : undefined,
      notes: { pickup_id: pickupId, payment_id: payment.id },
      expireBy,
    });
  } catch (error) {
    console.error("[quote accept] createPaymentLink failed", error, razorpayCredentialDiagnostics());
    await revert();
    return { ok: false, reason: "failed" };
  }

  const { error: updateErr } = await admin
    .from("payments")
    .update({
      provider: "razorpay",
      razorpay_payment_link_id: link.id,
      razorpay_payment_id: null,
      payment_link_url: link.shortUrl,
      paid_at: null,
    })
    .eq("id", payment.id);
  if (updateErr) {
    console.error("[quote accept] failed to record link", { pickupId, updateErr });
  }

  await admin.from("pickup_events").insert({
    pickup_id: pickupId,
    status: "requested",
    changed_by: process.env.SYSTEM_GUEST_PROFILE_ID || null,
    notes: `Guest accepted the quote (₹${amountRs.toLocaleString("en-IN")}) — payment link sent, valid ${PAYMENT_LINK_VALID_HOURS} hours`,
  });

  await sendBwgPaymentLinkWhatsApp(pickupId, { amountRs, shortUrl: link.shortUrl });

  return { ok: true, shortUrl: link.shortUrl, amountRs };
}
