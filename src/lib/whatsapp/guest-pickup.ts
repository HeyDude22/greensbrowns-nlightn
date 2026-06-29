import type { SupabaseClient } from "@supabase/supabase-js";
import { PICKUP_TERMINAL_STATUSES } from "@/lib/pickup-status-flow";
import { isOverOneOffLimit, recordRateEvent } from "./abuse-guard";
import { sendBwgPickupRequestedWhatsApp } from "./notifications";

/**
 * Commit step for the guest (non-registered) one-off pickup flow.
 *
 * Every one-off pickup is attributed to the system guest org + system guest
 * profile (seeded in migration 00052) so the NOT NULL foreign keys on pickups
 * are satisfied without creating an org/profile per caller. The caller's real
 * identity is upserted into guest_requests (keyed by phone) so a returning
 * guest can be recognized and offered their saved details.
 */

const SYSTEM_GUEST_ORG_ID = process.env.SYSTEM_GUEST_ORG_ID ?? "";
const SYSTEM_GUEST_PROFILE_ID = process.env.SYSTEM_GUEST_PROFILE_ID ?? "";

/** Window within which an identical one-off request is treated as a duplicate. */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export interface GuestPickupArgs {
  phone: string;
  requesterName: string;
  orgName: string;
  address: string;
  gstin: string | null;
  lat: number;
  lng: number;
  scheduledDate: string;
  scheduledSlot: string;
  notes: string | null;
  photoUrls: string[];
}

export type GuestPickupResult =
  | {
      ok: true;
      pickupId: string;
      pickupNumber: string | null;
      deduped?: boolean;
    }
  | { ok: false; limited?: boolean; message: string };

export async function createGuestPickup(
  supabase: SupabaseClient,
  args: GuestPickupArgs,
): Promise<GuestPickupResult> {
  if (!SYSTEM_GUEST_ORG_ID || !SYSTEM_GUEST_PROFILE_ID) {
    console.error(
      "[WhatsApp] guest system ids not configured (SYSTEM_GUEST_ORG_ID / SYSTEM_GUEST_PROFILE_ID)",
    );
    return {
      ok: false,
      message:
        "Sorry, one-off pickups are temporarily unavailable. Please try again later.",
    };
  }

  // Abuse cap: per-phone and global daily limits on guest pickup creation.
  if (await isOverOneOffLimit(supabase, args.phone)) {
    return {
      ok: false,
      limited: true,
      message:
        "You've reached the daily limit for one-off pickup requests. Please try again tomorrow or contact GreensBrowns support.",
    };
  }

  const normalizedPhone = args.phone.replace(/\D/g, "");

  // Upsert the caller's identity so returning guests can reuse it next time.
  const { data: guest, error: guestErr } = await supabase
    .from("guest_requests")
    .upsert(
      {
        phone: normalizedPhone,
        requester_name: args.requesterName,
        org_name: args.orgName,
        address: args.address,
        gstin: args.gstin,
        lat: args.lat,
        lng: args.lng,
      },
      { onConflict: "phone" },
    )
    .select("id")
    .single();

  if (guestErr || !guest) {
    console.error("[WhatsApp] guest_requests upsert failed", guestErr);
    return {
      ok: false,
      message:
        "Sorry, I couldn't save your request. Please try again in a moment.",
    };
  }

  // Idempotency: if an equivalent one-off request was just created (echoed
  // webhook or rapid re-send), reuse it instead of creating a duplicate.
  const sinceIso = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const inactiveList = `(${PICKUP_TERMINAL_STATUSES.map((s) => `"${s}"`).join(
    ",",
  )})`;
  const { data: existing } = await supabase
    .from("pickups")
    .select("id, pickup_number")
    .eq("is_one_off", true)
    .eq("guest_request_id", guest.id)
    .eq("scheduled_date", args.scheduledDate)
    .eq("scheduled_slot", args.scheduledSlot)
    .not("status", "in", inactiveList)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      pickupId: existing.id,
      pickupNumber: existing.pickup_number,
      deduped: true,
    };
  }

  const { data: pickup, error: pickupErr } = await supabase
    .from("pickups")
    .insert({
      organization_id: SYSTEM_GUEST_ORG_ID,
      requested_by: SYSTEM_GUEST_PROFILE_ID,
      status: "requested",
      is_one_off: true,
      scheduled_date: args.scheduledDate,
      scheduled_slot: args.scheduledSlot,
      notes: args.notes,
      loading_helper_required: false,
      waste_photo_urls: args.photoUrls,
      pickup_lat: args.lat,
      pickup_lng: args.lng,
      guest_request_id: guest.id,
    })
    .select("id, pickup_number")
    .single();

  if (pickupErr || !pickup) {
    console.error("[WhatsApp] guest pickup insert failed", pickupErr);
    return {
      ok: false,
      message:
        "Sorry, I couldn't create the pickup request. Please try again in a moment.",
    };
  }

  // Payment details live in the payments table, not on the pickup. Seed an
  // awaiting-quote row; the quote/QR/Razorpay flow fills it in a later phase.
  const { error: paymentErr } = await supabase.from("payments").insert({
    pickup_id: pickup.id,
    status: "awaiting_quote",
  });
  if (paymentErr) {
    console.error("[WhatsApp] guest payment row insert failed", paymentErr);
  }

  await supabase.from("pickup_events").insert({
    pickup_id: pickup.id,
    status: "requested",
    changed_by: SYSTEM_GUEST_PROFILE_ID,
    notes: "One-off pickup requested via WhatsApp (guest)",
  });

  await recordRateEvent(supabase, args.phone, "one_off_created");

  // Confirmation: the approved bwg_pickup_requested template with the number.
  await sendBwgPickupRequestedWhatsApp(pickup.id);

  return { ok: true, pickupId: pickup.id, pickupNumber: pickup.pickup_number };
}
