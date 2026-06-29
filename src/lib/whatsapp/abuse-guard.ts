import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Inbound WhatsApp abuse controls: phone blocklist and DB-backed sliding-window
 * rate limiting. Postgres-backed so it works on stateless serverless (Vercel).
 * All functions take the service-role client and key off the sender phone.
 */

/** Max inbound messages per phone within the message window before throttling. */
const MESSAGE_RATE_LIMIT = 15;
const MESSAGE_RATE_WINDOW_MS = 60 * 1000; // 1 minute

/** Caps for guest one-off pickup creation (consumed by the guest flow later). */
const ONE_OFF_DAILY_LIMIT_PER_PHONE = 3;
const ONE_OFF_DAILY_LIMIT_GLOBAL = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RateEventKind = "message" | "one_off_created";

/** Keywords that explicitly opt a sender into starting a guest one-off flow. */
export const GUEST_OPT_IN_KEYWORDS = new Set([
  "pickup",
  "new pickup",
  "new",
  "start",
]);

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** True if the text is an explicit opt-in to begin a guest flow. */
export function isOptInKeyword(text: string): boolean {
  return GUEST_OPT_IN_KEYWORDS.has(text.toLowerCase().trim());
}

export async function isPhoneBlocked(
  supabase: SupabaseClient,
  phone: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("whatsapp_blocked_phones")
    .select("phone")
    .eq("phone", normalizePhone(phone))
    .maybeSingle();

  if (error) {
    console.error("[WhatsApp] blocklist lookup failed", error);
    return false; // fail open: don't lock out everyone on a transient error
  }
  return !!data;
}

export async function recordRateEvent(
  supabase: SupabaseClient,
  phone: string,
  kind: RateEventKind = "message",
): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_rate_events")
    .insert({ phone: normalizePhone(phone), kind });

  if (error) {
    console.error("[WhatsApp] rate event insert failed", { kind, error });
  }
}

/** True if the phone has exceeded the inbound message rate in the window. */
export async function isOverMessageRate(
  supabase: SupabaseClient,
  phone: string,
): Promise<boolean> {
  const sinceIso = new Date(Date.now() - MESSAGE_RATE_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("whatsapp_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("phone", normalizePhone(phone))
    .eq("kind", "message")
    .gte("created_at", sinceIso);

  if (error) {
    console.error("[WhatsApp] rate count failed", error);
    return false; // fail open
  }
  return (count ?? 0) > MESSAGE_RATE_LIMIT;
}

/** Number of guest one-off pickups this phone created in the last 24h. */
export async function oneOffCountToday(
  supabase: SupabaseClient,
  phone: string,
): Promise<number> {
  const sinceIso = new Date(Date.now() - DAY_MS).toISOString();
  const { count } = await supabase
    .from("whatsapp_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("phone", normalizePhone(phone))
    .eq("kind", "one_off_created")
    .gte("created_at", sinceIso);
  return count ?? 0;
}

/** Total guest one-off pickups created across all phones in the last 24h. */
export async function oneOffGlobalToday(
  supabase: SupabaseClient,
): Promise<number> {
  const sinceIso = new Date(Date.now() - DAY_MS).toISOString();
  const { count } = await supabase
    .from("whatsapp_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("kind", "one_off_created")
    .gte("created_at", sinceIso);
  return count ?? 0;
}

export async function isOverOneOffLimit(
  supabase: SupabaseClient,
  phone: string,
): Promise<boolean> {
  const [perPhone, global] = await Promise.all([
    oneOffCountToday(supabase, phone),
    oneOffGlobalToday(supabase),
  ]);
  return (
    perPhone >= ONE_OFF_DAILY_LIMIT_PER_PHONE ||
    global >= ONE_OFF_DAILY_LIMIT_GLOBAL
  );
}
