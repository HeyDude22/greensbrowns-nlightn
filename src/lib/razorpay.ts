import crypto from "crypto";

/**
 * Minimal Razorpay Payment Links client (server-only).
 *
 * Uses Basic auth (key_id:key_secret). Amounts are sent in PAISE — the rest of
 * the app works in rupees, so conversion happens here and only here.
 *
 * Docs: https://razorpay.com/docs/api/payments/payment-links/
 */

const KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

const API_BASE = "https://api.razorpay.com/v1";

export function isRazorpayConfigured(): boolean {
  return Boolean(KEY_ID && KEY_SECRET);
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
}

export interface CreatePaymentLinkArgs {
  amountRs: number;
  /** Must be unique per link (Razorpay rejects duplicate reference_id). */
  referenceId: string;
  customerName: string;
  /** Digits, with or without country code; normalized to +91XXXXXXXXXX. */
  customerPhone: string;
  description: string;
  callbackUrl?: string;
  notes?: Record<string, string>;
  /** Unix seconds; when the link should expire. */
  expireBy?: number;
}

export interface PaymentLink {
  id: string;
  shortUrl: string;
  status: string;
}

function razorpayContact(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const withCc = digits.startsWith("91") ? digits : `91${digits}`;
  return `+${withCc}`;
}

export async function createPaymentLink(
  args: CreatePaymentLinkArgs,
): Promise<PaymentLink> {
  if (!isRazorpayConfigured()) {
    throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID/SECRET).");
  }

  const body: Record<string, unknown> = {
    amount: Math.round(args.amountRs * 100), // paise
    currency: "INR",
    accept_partial: false,
    reference_id: args.referenceId,
    description: args.description.slice(0, 2048),
    customer: {
      name: args.customerName.slice(0, 200),
      contact: razorpayContact(args.customerPhone),
    },
    // We deliver the link over WhatsApp ourselves; don't let Razorpay SMS/email.
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: args.notes ?? {},
    ...(args.callbackUrl
      ? { callback_url: args.callbackUrl, callback_method: "get" }
      : {}),
    ...(args.expireBy ? { expire_by: args.expireBy } : {}),
  };

  const res = await fetch(`${API_BASE}/payment_links`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      `Razorpay createPaymentLink failed (${res.status}): ${JSON.stringify(data)}`,
    );
  }

  return {
    id: data.id as string,
    shortUrl: data.short_url as string,
    status: data.status as string,
  };
}

/**
 * Cancel a payment link. Only links in 'created' state can be cancelled; a link
 * that was already paid/expired/cancelled will 400, which we swallow (best
 * effort — the goal is just to make sure no second link stays payable).
 */
export async function cancelPaymentLink(linkId: string): Promise<void> {
  if (!isRazorpayConfigured() || !linkId) return;

  try {
    const res = await fetch(`${API_BASE}/payment_links/${linkId}/cancel`, {
      method: "POST",
      headers: { Authorization: authHeader() },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn("[Razorpay] cancelPaymentLink non-OK", {
        linkId,
        status: res.status,
        data,
      });
    }
  } catch (error) {
    console.warn("[Razorpay] cancelPaymentLink error", { linkId, error });
  }
}

/**
 * Verify the X-Razorpay-Signature header over the RAW request body using the
 * webhook secret. Hash the exact bytes Razorpay sent — never a re-serialized
 * object.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  if (!WEBHOOK_SECRET) {
    console.error("[Razorpay] RAZORPAY_WEBHOOK_SECRET not configured — rejecting");
    return false;
  }
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
