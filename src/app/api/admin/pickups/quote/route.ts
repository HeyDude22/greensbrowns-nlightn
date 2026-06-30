import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createPaymentLink,
  cancelPaymentLink,
  isRazorpayConfigured,
} from "@/lib/razorpay";
import { sendBwgPaymentLinkWhatsApp } from "@/lib/whatsapp/notifications";

/**
 * Admin action: send (or resend) a Razorpay payment link for a one-off pickup.
 *
 * The pickup stays 'requested' the whole time; only payments.status moves
 * (awaiting_quote/failed/quoted -> quoted). On resend, the previous Razorpay
 * link is cancelled first so two payable links never coexist.
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
  try {
    const body = (await req.json()) as { pickupId?: string; quoteAmountRs?: number };
    pickupId = body.pickupId ?? "";
    quoteAmountRs = Number(body.quoteAmountRs);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!pickupId || !Number.isFinite(quoteAmountRs) || quoteAmountRs <= 0) {
    return NextResponse.json(
      { error: "pickupId and a positive quoteAmountRs are required" },
      { status: 400 },
    );
  }

  // Load the pickup + its guest contact + current payment row.
  const { data: pickup, error: pickupErr } = await admin
    .from("pickups")
    .select(
      "id, pickup_number, status, is_one_off, guest_requests(requester_name, phone)",
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

  const { data: payment, error: paymentErr } = await admin
    .from("payments")
    .select("id, status, razorpay_payment_link_id")
    .eq("pickup_id", pickupId)
    .maybeSingle();

  if (paymentErr) {
    return NextResponse.json({ error: "Failed to load payment" }, { status: 500 });
  }

  const currentStatus = payment?.status ?? "awaiting_quote";
  const allowed = ["awaiting_quote", "failed", "quoted"];
  if (!allowed.includes(currentStatus)) {
    return NextResponse.json(
      { error: `Cannot send a link while payment is '${currentStatus}'` },
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

  // Resend: cancel the previous link so it can no longer be paid.
  if (payment?.razorpay_payment_link_id) {
    await cancelPaymentLink(payment.razorpay_payment_link_id);
  }

  // reference_id must be unique per link; we reconcile via the link id + notes.
  const referenceId = `oneoff-${pickupId.slice(0, 8)}-${Date.now().toString(36)}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  let link;
  try {
    link = await createPaymentLink({
      amountRs: quoteAmountRs,
      referenceId,
      customerName: guest.requester_name ?? "GreensBrowns Customer",
      customerPhone: guest.phone,
      description: `GreensBrowns one-off pickup ${pickup.pickup_number ?? pickupId}`,
      callbackUrl: appUrl ? `${appUrl}/payment-status` : undefined,
      notes: { pickup_id: pickupId, payment_id: payment?.id ?? "" },
    });
  } catch (error) {
    console.error("[quote] createPaymentLink failed", error);
    return NextResponse.json(
      { error: "Failed to create payment link" },
      { status: 502 },
    );
  }

  // Upsert the payment row to 'quoted' with the new link details.
  const paymentRow = {
    pickup_id: pickupId,
    status: "quoted",
    quote_amount_rs: quoteAmountRs,
    quoted_at: new Date().toISOString(),
    paid_at: null,
    provider: "razorpay",
    razorpay_payment_link_id: link.id,
    razorpay_payment_id: null,
    payment_link_url: link.shortUrl,
    failure_reason: null,
  };

  const { error: upsertErr } = await admin
    .from("payments")
    .upsert(paymentRow, { onConflict: "pickup_id" });

  if (upsertErr) {
    console.error("[quote] payment upsert failed", upsertErr);
    return NextResponse.json(
      { error: "Failed to record payment" },
      { status: 500 },
    );
  }

  const ssr = await createClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();

  await admin.from("pickup_events").insert({
    pickup_id: pickupId,
    status: "requested",
    changed_by: user?.id ?? null,
    notes: `Payment link sent (₹${quoteAmountRs.toLocaleString("en-IN")})`,
  });

  await sendBwgPaymentLinkWhatsApp(pickupId, {
    amountRs: quoteAmountRs,
    shortUrl: link.shortUrl,
  });

  return NextResponse.json({
    ok: true,
    status: "quoted",
    quoteAmountRs,
    paymentLinkUrl: link.shortUrl,
  });
}
