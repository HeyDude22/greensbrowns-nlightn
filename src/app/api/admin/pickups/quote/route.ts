import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cancelPaymentLink, isRazorpayConfigured } from "@/lib/razorpay";
import { sendBwgQuoteReadyWhatsApp } from "@/lib/whatsapp/notifications";

/**
 * Admin action: send (or resend) the quote for a one-off pickup (UAT-5).
 *
 * Sends bwg_quote_ready with Accept Quote / Reject Quote buttons and sets
 * payments.status to 'quote_sent'. The Razorpay link (valid 24 hours) is only
 * created when the guest taps Accept Quote. The pickup stays 'requested' the
 * whole time. On resend, any previous link is cancelled so it can't be paid.
 */
export async function POST(req: NextRequest) {
  const { admin, error: authError } = await verifyAdmin();
  if (authError || !admin) {
    return NextResponse.json({ error: authError ?? "Unauthorized" }, { status: 401 });
  }

  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      { error: "Razorpay is not configured on the server." },
      { status: 503 },
    );
  }

  let pickupId: string;
  let quoteAmountRs: number;
  let farmerId: string;
  try {
    const body = (await req.json()) as {
      pickupId?: string;
      quoteAmountRs?: number;
      farmerId?: string;
    };
    pickupId = body.pickupId ?? "";
    quoteAmountRs = Number(body.quoteAmountRs);
    farmerId = body.farmerId ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!pickupId || !Number.isFinite(quoteAmountRs) || quoteAmountRs <= 0) {
    return NextResponse.json(
      { error: "pickupId and a positive quoteAmountRs are required" },
      { status: 400 },
    );
  }
  if (!farmerId) {
    return NextResponse.json({ error: "Select a processor for this pickup" }, { status: 400 });
  }

  const { data: processor } = await admin
    .from("profiles")
    .select("id")
    .eq("id", farmerId)
    .eq("role", "farmer")
    .maybeSingle();
  if (!processor) {
    return NextResponse.json({ error: "Processor not found" }, { status: 400 });
  }

  // Load the pickup + its guest contact + current payment row.
  const { data: pickup, error: pickupErr } = await admin
    .from("pickups")
    .select(
      "id, pickup_number, status, is_one_off, estimated_weight_kg, guest_requests(requester_name, phone)",
    )
    .eq("id", pickupId)
    .single();

  if (pickupErr || !pickup) {
    return NextResponse.json({ error: "Pickup not found" }, { status: 404 });
  }
  if (!pickup.is_one_off) {
    return NextResponse.json(
      { error: "Payment links are only for one-off pickups" },
      { status: 400 },
    );
  }
  if (pickup.status !== "requested") {
    return NextResponse.json(
      { error: `Pickup is '${pickup.status}', not awaiting payment` },
      { status: 409 },
    );
  }

  if (!pickup.estimated_weight_kg || pickup.estimated_weight_kg <= 0) {
    return NextResponse.json(
      { error: "Estimated weight must be verified before sending a payment link" },
      { status: 400 },
    );
  }

  const { data: payment, error: paymentErr } = await admin
    .from("payments")
    .select("id, status, razorpay_payment_link_id")
    .eq("pickup_id", pickupId)
    .maybeSingle();

  if (paymentErr) {
    return NextResponse.json({ error: "Failed to load payment" }, { status: 500 });
  }

  const currentStatus = payment?.status ?? "awaiting_quote";
  const allowed = ["awaiting_quote", "quote_sent", "failed", "quoted"];
  if (!allowed.includes(currentStatus)) {
    return NextResponse.json(
      { error: `Cannot send a quote while payment is '${currentStatus}'` },
      { status: 409 },
    );
  }

  const guest = pickup.guest_requests as unknown as {
    requester_name: string | null;
    phone: string | null;
  } | null;
  if (!guest?.phone) {
    return NextResponse.json(
      { error: "No contact phone found for this guest" },
      { status: 400 },
    );
  }

  // Resend: cancel any previous link so it can no longer be paid.
  if (payment?.razorpay_payment_link_id) {
    await cancelPaymentLink(payment.razorpay_payment_link_id);
  }

  // The quote waits for the guest's Accept Quote / Reject Quote. The payment
  // link is only created on Accept (see lib/one-off-payment-link.ts).
  const paymentRow = {
    pickup_id: pickupId,
    status: "quote_sent",
    quote_amount_rs: quoteAmountRs,
    quoted_at: new Date().toISOString(),
    paid_at: null,
    provider: "razorpay",
    razorpay_payment_link_id: null,
    razorpay_payment_id: null,
    payment_link_url: null,
    failure_reason: null,
  };

  const { error: upsertErr } = await admin
    .from("payments")
    .upsert(paymentRow, { onConflict: "pickup_id" });

  if (upsertErr) {
    console.error("[quote] payment upsert failed", upsertErr);
    return NextResponse.json(
      { error: "Failed to record quote" },
      { status: 500 },
    );
  }

  // The processor the quote was priced for is the one the job will deliver to.
  const { error: farmerErr } = await admin
    .from("pickups")
    .update({ farmer_id: farmerId })
    .eq("id", pickupId);
  if (farmerErr) {
    console.error("[quote] failed to save processor", farmerErr);
  }

  const ssr = await createClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();

  await admin.from("pickup_events").insert({
    pickup_id: pickupId,
    status: "requested",
    changed_by: user?.id ?? null,
    notes: `Quote sent (₹${quoteAmountRs.toLocaleString("en-IN")}) — waiting for the guest to accept or reject`,
  });

  const messageId = await sendBwgQuoteReadyWhatsApp(pickupId, quoteAmountRs);
  if (!messageId) {
    return NextResponse.json(
      { error: "Quote saved, but the WhatsApp message failed to send. Try Resend quote." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: "quote_sent",
    quoteAmountRs,
  });
}
