import crypto from "crypto";

/**
 * Minimal Razorpay Payment Links client (server-only).
 *
 * Uses Basic auth (key_id:key_secret). Amounts are sent in PAISE — the rest of
 * the app works in rupees, so conversion happens here and only here.
 *
 * Docs: https://razorpay.com/docs/api/payments/payment-links/
 */

const API_BASE = "https://api.razorpay.com/v1";

/** Strip whitespace, wrapping quotes, and zero-width chars from pasted env values. */
function sanitizeEnv(value: string): string {
  let v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v.replace(/[\u200B-\u200D\uFEFF]/g, "");
}

/**
 * Read credentials at call time. Bracket access avoids Next.js inlining empty
 * values at build when vars were missing during `next build`.
 */
function getCredentials(): { keyId: string; keySecret: string; webhookSecret: string } {
  return {
    keyId: sanitizeEnv(process.env["RAZORPAY_KEY_ID"] ?? ""),
    keySecret: sanitizeEnv(process.env["RAZORPAY_KEY_SECRET"] ?? ""),
    webhookSecret: sanitizeEnv(process.env["RAZORPAY_WEBHOOK_SECRET"] ?? ""),
  };
}

export function isRazorpayConfigured(): boolean {
  const { keyId, keySecret } = getCredentials();
  return Boolean(keyId && keySecret);
}

/** Safe metadata for debugging 401s — never exposes secrets. */
export function razorpayCredentialDiagnostics(): {
  configured: boolean;
  keyIdPrefix: string | null;
  keyIdLooksValid: boolean;
  secretLength: number;
  likelySwapped: boolean;
} {
  const { keyId, keySecret } = getCredentials();
  const keyIdLooksValid = /^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId);
  const secretLooksLikeKeyId = /^rzp_(test|live)_/.test(keySecret);
  return {
    configured: Boolean(keyId && keySecret),
    keyIdPrefix: keyId ? `${keyId.slice(0, 12)}…` : null,
    keyIdLooksValid,
    secretLength: keySecret.length,
    likelySwapped: !keyIdLooksValid && secretLooksLikeKeyId,
  };
}

function authHeader(): string {
  const { keyId, keySecret } = getCredentials();
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

/** Lightweight auth probe — lists 1 payment link (or empty list). */
export async function probeRazorpayAuth(): Promise<{
  ok: boolean;
  status: number;
  error?: string;
}> {
  if (!isRazorpayConfigured()) {
    return { ok: false, status: 0, error: "not_configured" };
  }

  const res = await fetch(`${API_BASE}/payment_links?count=1`, {
    headers: { Authorization: authHeader() },
  });

  if (res.ok) return { ok: true, status: res.status };

  const data = (await res.json().catch(() => ({}))) as {
    error?: { description?: string };
  };
  return {
    ok: false,
    status: res.status,
    error: data.error?.description ?? `HTTP ${res.status}`,
  };
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
    const err = new Error(
      `Razorpay createPaymentLink failed (${res.status}): ${JSON.stringify(data)}`,
    ) as Error & { statusCode?: number };
    err.statusCode = res.status;
    throw err;
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
  const { webhookSecret } = getCredentials();
  if (!webhookSecret) {
    console.error("[Razorpay] RAZORPAY_WEBHOOK_SECRET not configured — rejecting");
    return false;
  }
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
