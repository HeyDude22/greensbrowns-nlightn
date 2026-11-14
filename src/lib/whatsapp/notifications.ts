import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppButtons } from "./client";
import { COLLECTOR_ACTION_PROMPT } from "./templates";
import { COLLECTOR_PICKED_UP_BUTTON } from "./types";
import {
  sendTemplateBwgDeliveryConfirmed,
  sendTemplateBwgPickupCancelled,
  sendTemplateBwgPickupCollected,
  sendTemplateBwgPickupPartial,
  sendTemplateBwgPickupRequested,
  sendTemplateBwgPaymentLink,
  sendTemplateBwgQuoteReady,
  sendTemplateBwgPickupScheduled,
  sendTemplateCollectorJobAssigned,
  sendTemplateCollectorPickupFirstReminder,
  sendTemplateCollectorPickupReminder1h,
  sendTemplateFarmerDeliveryIncoming,
  sendTemplateAdminPickupPartial,
  sendTemplateAdminVehicleBreakdown,
  sendTemplateBwgVehicleBreakdown,
  sendTemplateBwgVehicleArrived,
  sendTemplateBwgNoShowWarning1,
  sendTemplateBwgNoShowWarning2,
  sendTemplateBwgAccountSuspended,
  sendTemplateAdminBwgNoShow,
} from "./wa-templates";
import { getPickupWhatsAppContext } from "./pickup-context";
import { formatDateDDMMYYYY } from "@/lib/utils";
import { SLOT_START_HOUR_IST, addDaysIso, slotStartUtc, todayIst } from "@/lib/ist-date";

const supabase = createAdminClient();

/** Session buttons for collector replies within an open 24h window */
export async function sendCollectorActionButtons(phone: string, body?: string) {
  await sendWhatsAppButtons(
    phone,
    body ?? COLLECTOR_ACTION_PROMPT,
    COLLECTOR_PICKED_UP_BUTTON
  );
}

// --- Transporter notifications ---

export async function sendJobAssignedNotification(pickupId: string) {
  const { data: pickup } = await supabase
    .from("pickups")
    .select(
      "id, scheduled_date, scheduled_slot, vehicle_id, organization_id, organizations(name, address, lat, lng)"
    )
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const ctx = await getPickupWhatsAppContext(supabase, pickupId);
  if (!ctx) {
    console.warn("[Job Assigned] skip: could not load pickup context", { pickupId });
    return;
  }

  const org = pickup.organizations as unknown as {
    name: string;
    address: string;
    lat: number | null;
    lng: number | null;
  };
  if (!org?.lat || !org?.lng) return;

  if (!pickup.vehicle_id) return;

  const { data: vehicleDrivers } = await supabase
    .from("vehicle_drivers")
    .select("driver_id, drivers(name, phone)")
    .eq("vehicle_id", pickup.vehicle_id);

  if (!vehicleDrivers?.length) return;

  for (const vd of vehicleDrivers) {
    const driver = vd.drivers as unknown as { name: string; phone: string | null };
    if (driver?.phone) {
      const messageId = await sendTemplateCollectorJobAssigned(driver.phone, ctx, {
        orgName: org.name,
        address: org.address,
        date: ctx.pickupDate,
        slot: pickup.scheduled_slot,
        lat: org.lat,
        lng: org.lng,
      });
      if (!messageId) {
        console.error("[Job Assigned] template send failed", {
          pickupId,
          phone: driver.phone,
        });
      }
    }
  }
}

/** Hours before the slot start that the first reminder is due. */
const FIRST_REMINDER_LEAD_HOURS: Record<string, number> = {
  morning: 18,
  afternoon: 18,
  evening: 12,
};

/** Hours after the slot start that the slot ends; no reminders after that. */
const SLOT_LENGTH_HOURS: Record<string, number> = {
  morning: 6,
  afternoon: 4,
  evening: 4,
};

const HOUR_MS = 60 * 60 * 1000;

type ReminderPickup = {
  id: string;
  scheduled_date: string;
  scheduled_slot: string | null;
  vehicle_id: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  first_reminder_sent_at: string | null;
  reminder_1h_sent_at: string | null;
  organizations: { name: string; address: string | null; lat: number | null; lng: number | null } | null;
  guest_requests: { org_name: string | null; address: string | null } | null;
};

export type DriverReminderDecision = "none" | "first" | "1h";

/**
 * Which reminder is due now for one pickup (UAT-2):
 * - within 1h of the slot start (or after it, until the slot ends): the 1h
 *   reminder, and the first reminder is skipped if it never went out;
 * - within 18h (12h for evening) of the slot start: the first reminder;
 * - otherwise nothing yet.
 */
export function decideDriverReminder(
  p: Pick<ReminderPickup, "scheduled_date" | "scheduled_slot" | "first_reminder_sent_at" | "reminder_1h_sent_at">,
  now: Date,
): DriverReminderDecision {
  const slot = p.scheduled_slot;
  const start = slotStartUtc(p.scheduled_date, slot);
  if (!start || !slot) return "none";

  const startMs = start.getTime();
  const nowMs = now.getTime();
  const endMs = startMs + (SLOT_LENGTH_HOURS[slot] ?? 4) * HOUR_MS;
  if (nowMs > endMs) return "none";

  if (nowMs >= startMs - HOUR_MS) {
    return p.reminder_1h_sent_at ? "none" : "1h";
  }
  if (nowMs >= startMs - FIRST_REMINDER_LEAD_HOURS[slot] * HOUR_MS) {
    return p.first_reminder_sent_at ? "none" : "first";
  }
  return "none";
}

/**
 * Send every driver reminder that is due. Called by the reminders cron (all
 * assigned pickups dated today or tomorrow) and straight after a job is
 * assigned (just those pickups), so urgent jobs get their reminder at once.
 * Each reminder is recorded on the pickup so it is never sent twice.
 */
export async function sendDueDriverReminders(
  options: { pickupIds?: string[]; now?: Date } = {},
): Promise<{ first: number; oneHour: number }> {
  const now = options.now ?? new Date();
  const today = todayIst(now);

  let query = supabase
    .from("pickups")
    .select(
      "id, scheduled_date, scheduled_slot, vehicle_id, pickup_lat, pickup_lng, first_reminder_sent_at, reminder_1h_sent_at, organizations(name, address, lat, lng), guest_requests(org_name, address)",
    )
    .in("status", ["assigned", "driver_accepted"])
    .or("first_reminder_sent_at.is.null,reminder_1h_sent_at.is.null");

  query = options.pickupIds?.length
    ? query.in("id", options.pickupIds)
    : query.gte("scheduled_date", today).lte("scheduled_date", addDaysIso(today, 1));

  const { data, error } = await query;
  if (error) {
    console.error("[Driver Reminders] pickup query failed", error);
    return { first: 0, oneHour: 0 };
  }

  const sent = { first: 0, oneHour: 0 };

  for (const pickup of (data ?? []) as unknown as ReminderPickup[]) {
    const decision = decideDriverReminder(pickup, now);
    if (decision === "none") continue;

    if (!pickup.vehicle_id) {
      console.warn("[Driver Reminders] skip: no vehicle", { pickupId: pickup.id });
      continue;
    }

    const org = pickup.organizations;
    const lat = org?.lat ?? pickup.pickup_lat;
    const lng = org?.lng ?? pickup.pickup_lng;
    if (lat == null || lng == null) {
      console.warn("[Driver Reminders] skip: no pickup location", { pickupId: pickup.id });
      continue;
    }

    const ctx = await getPickupWhatsAppContext(supabase, pickup.id);
    if (!ctx) continue;

    const { data: vehicleDrivers } = await supabase
      .from("vehicle_drivers")
      .select("drivers(name, phone)")
      .eq("vehicle_id", pickup.vehicle_id);

    const phones = (vehicleDrivers ?? [])
      .map((vd) => (vd.drivers as unknown as { phone: string | null } | null)?.phone)
      .filter((phone): phone is string => !!phone);

    if (!phones.length) {
      console.warn("[Driver Reminders] skip: no driver phone on vehicle", {
        pickupId: pickup.id,
        vehicleId: pickup.vehicle_id,
      });
      continue;
    }

    const guest = pickup.guest_requests;
    const orgName = guest?.org_name ?? org?.name ?? ctx.bwgName;
    const address = org?.address ?? guest?.address ?? "—";

    let anySent = false;
    for (const phone of phones) {
      const messageId =
        decision === "first"
          ? await sendTemplateCollectorPickupFirstReminder(phone, ctx, {
              orgName,
              address,
              date: ctx.pickupDate,
              slot: pickup.scheduled_slot,
              lat,
              lng,
            })
          : await sendTemplateCollectorPickupReminder1h(phone, ctx, {
              orgName,
              slot: pickup.scheduled_slot,
              lat,
              lng,
            });
      if (messageId) {
        anySent = true;
      } else {
        console.error(`[Driver Reminders] ${decision} reminder send failed`, {
          pickupId: pickup.id,
          phone,
        });
      }
    }

    if (!anySent) continue;

    const stamp = now.toISOString();
    // A 1h reminder also closes the first reminder, so a late first one never follows it.
    const update =
      decision === "first"
        ? { first_reminder_sent_at: stamp }
        : {
            reminder_1h_sent_at: stamp,
            first_reminder_sent_at: pickup.first_reminder_sent_at ?? stamp,
          };
    await supabase.from("pickups").update(update).eq("id", pickup.id);

    if (decision === "first") sent.first += 1;
    else sent.oneHour += 1;
  }

  return sent;
}

/** Clear reminder markers so a newly (re)assigned pickup gets its reminders again. */
export async function resetDriverReminders(pickupIds: string[]): Promise<void> {
  if (!pickupIds.length) return;
  const { error } = await supabase
    .from("pickups")
    .update({ first_reminder_sent_at: null, reminder_1h_sent_at: null })
    .in("id", pickupIds);
  if (error) console.error("[Driver Reminders] reset failed", { pickupIds, error });
}

/**
 * Processor heads-up the day before delivery (farmer_delivery_incoming).
 * Unchanged from the old 24-hour reminder run: sent at 06:00, 12:00 and 16:00
 * IST for the next day's morning, afternoon and evening slots.
 */
export async function sendFarmerDeliveryIncomingReminders(now: Date = new Date()) {
  const istHour = Math.floor(((now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440) / 60);
  const targetSlot = Object.entries(SLOT_START_HOUR_IST).find(([, hour]) => hour === istHour)?.[0];
  if (!targetSlot) return;

  const dateStr = addDaysIso(todayIst(now), 1);

  const { data: pickups } = await supabase
    .from("pickups")
    .select("id, scheduled_slot, vehicle_id, farmer_id, estimated_weight_kg")
    .eq("scheduled_date", dateStr)
    .eq("scheduled_slot", targetSlot)
    .in("status", ["assigned", "driver_accepted"]);

  for (const pickup of pickups ?? []) {
    if (!pickup.farmer_id) continue;

    const ctx = await getPickupWhatsAppContext(supabase, pickup.id);
    if (!ctx) continue;

    const { data: farmerProfile, error: profileError } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", pickup.farmer_id)
      .single();

    if (profileError) {
      console.error("[Farmer Reminder] profile lookup error", {
        pickupId: pickup.id,
        farmerId: pickup.farmer_id,
        error: profileError.message,
      });
    }

    if (!farmerProfile?.phone) {
      console.warn("[Farmer Reminder] skip: no farmer phone", {
        pickupId: pickup.id,
        farmerId: pickup.farmer_id,
      });
      continue;
    }
    if (!pickup.vehicle_id) {
      console.warn("[Farmer Reminder] skip: no vehicle_id", { pickupId: pickup.id });
      continue;
    }

    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("registration_number")
      .eq("id", pickup.vehicle_id)
      .single();

    const { data: driverData } = await supabase
      .from("vehicle_drivers")
      .select("drivers(name)")
      .eq("vehicle_id", pickup.vehicle_id)
      .limit(1)
      .single();

    const driverName = (driverData?.drivers as unknown as { name: string })?.name ?? "Collector";

    const messageId = await sendTemplateFarmerDeliveryIncoming(farmerProfile.phone, ctx, {
      slot: pickup.scheduled_slot,
      collectorName: driverName,
      weightKg: pickup.estimated_weight_kg,
      regNumber: vehicle?.registration_number ?? "N/A",
    });

    if (!messageId) {
      console.error("[Farmer Reminder] send failed", {
        pickupId: pickup.id,
        phone: farmerProfile.phone,
      });
    }
  }
}

// --- BWG WhatsApp notifications ---

async function resolveBwgPhone(pickupId: string): Promise<string | null> {
  const { data: pickup } = await supabase
    .from("pickups")
    .select(
      "id, is_one_off, organization_id, profiles!pickups_requested_by_fkey(phone), organizations(contact_phone), guest_requests(phone)"
    )
    .eq("id", pickupId)
    .single();

  if (!pickup) return null;

  // One-off pickups are attributed to the system guest profile (no phone) and
  // the system guest org — the real contact is the linked guest_requests phone.
  if (pickup.is_one_off) {
    const guest = pickup.guest_requests as unknown as { phone: string | null } | null;
    if (guest?.phone) return guest.phone;
  }

  const profile = pickup.profiles as unknown as { phone: string | null };
  const org = pickup.organizations as unknown as { contact_phone: string | null };

  return profile?.phone || org?.contact_phone || null;
}

export async function sendBwgPickupRequestedWhatsApp(pickupId: string) {
  const { data: pickup } = await supabase
    .from("pickups")
    .select(
      "id, pickup_number, scheduled_date, scheduled_slot, is_one_off, organizations(name), guest_requests(org_name)"
    )
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const phone = await resolveBwgPhone(pickupId);
  if (!phone) {
    console.warn(`[BWG WhatsApp] No phone for pickup ${pickupId} (profile or org contact)`);
    return;
  }

  const org = pickup.organizations as unknown as { name: string } | null;
  const guest = pickup.guest_requests as unknown as { org_name: string | null } | null;
  // For one-off pickups the org is the sentinel; show the guest's org name.
  const orgName = pickup.is_one_off
    ? guest?.org_name ?? "One-off pickup"
    : org?.name ?? "—";
  const messageId = await sendTemplateBwgPickupRequested(phone, {
    pickupNumber: pickup.pickup_number ?? pickupId,
    orgName,
    date: formatDateDDMMYYYY(pickup.scheduled_date),
    slot: pickup.scheduled_slot,
  });
  if (!messageId) {
    console.error("[BWG WhatsApp] pickup requested template failed", {
      pickupId,
      phone,
    });
  }
}

export async function sendBwgPaymentLinkWhatsApp(
  pickupId: string,
  params: { amountRs: number; shortUrl: string },
) {
  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, pickup_number")
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const phone = await resolveBwgPhone(pickupId);
  if (!phone) {
    console.warn(`[BWG WhatsApp] No phone for pickup ${pickupId} (payment link)`);
    return;
  }

  const messageId = await sendTemplateBwgPaymentLink(phone, {
    pickupNumber: pickup.pickup_number ?? pickupId,
    amountRs: params.amountRs,
    shortUrl: params.shortUrl,
  });
  if (!messageId) {
    console.error("[BWG WhatsApp] payment link template failed", {
      pickupId,
      phone,
    });
  }
}

/** Sends the one-off quote (Accept Quote / Reject Quote). Returns the message id, or null. */
export async function sendBwgQuoteReadyWhatsApp(
  pickupId: string,
  amountRs: number,
): Promise<string | null> {
  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, pickup_number, scheduled_date, scheduled_slot")
    .eq("id", pickupId)
    .single();

  if (!pickup) return null;

  const phone = await resolveBwgPhone(pickupId);
  if (!phone) {
    console.warn(`[BWG WhatsApp] No phone for pickup ${pickupId} (quote)`);
    return null;
  }

  const messageId = await sendTemplateBwgQuoteReady(phone, {
    pickupNumber: pickup.pickup_number ?? pickupId,
    date: formatDateDDMMYYYY(pickup.scheduled_date),
    slot: pickup.scheduled_slot,
    amountRs,
  });
  if (!messageId) {
    console.error("[BWG WhatsApp] quote template failed", { pickupId, phone });
  }
  return messageId;
}

export async function sendBwgPickupCancelledWhatsApp(pickupId: string) {
  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, pickup_number, scheduled_date, scheduled_slot")
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const phone = await resolveBwgPhone(pickupId);
  if (!phone) {
    console.warn(`[BWG WhatsApp] No phone for pickup ${pickupId} (profile or org contact)`);
    return;
  }

  const messageId = await sendTemplateBwgPickupCancelled(phone, {
    pickupNumber: pickup.pickup_number ?? pickupId,
    date: formatDateDDMMYYYY(pickup.scheduled_date),
    slot: pickup.scheduled_slot,
  });
  if (!messageId) {
    console.error("[BWG WhatsApp] pickup cancelled template failed", {
      pickupId,
      phone,
    });
  }
}

export async function sendBwgPickupWhatsApp(pickupId: string) {
  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, scheduled_date, scheduled_slot")
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const phone = await resolveBwgPhone(pickupId);
  if (!phone) {
    console.warn(`[BWG WhatsApp] No phone for pickup ${pickupId} (profile or org contact)`);
    return;
  }

  const ctx = await getPickupWhatsAppContext(supabase, pickupId);
  if (!ctx) {
    console.warn("[BWG WhatsApp] skip: could not load pickup context", { pickupId });
    return;
  }

  const messageId = await sendTemplateBwgPickupScheduled(phone, ctx, {
    slot: pickup.scheduled_slot,
  });
  if (!messageId) {
    console.error("[BWG WhatsApp] pickup scheduled template failed", {
      pickupId,
      phone,
    });
  }
}

export async function sendBwgVehicleArrivedWhatsApp(pickupId: string) {
  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, scheduled_slot")
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const phone = await resolveBwgPhone(pickupId);
  if (!phone) {
    console.warn(`[BWG WhatsApp] No phone for pickup ${pickupId} (profile or org contact)`);
    return;
  }

  const ctx = await getPickupWhatsAppContext(supabase, pickupId);
  if (!ctx) {
    console.warn("[BWG WhatsApp] skip: could not load pickup context", { pickupId });
    return;
  }

  const messageId = await sendTemplateBwgVehicleArrived(phone, ctx, {
    slot: pickup.scheduled_slot,
  });
  if (!messageId) {
    console.error("[BWG WhatsApp] vehicle arrived template failed", {
      pickupId,
      phone,
    });
  }
}

/**
 * Notify the BWG of a recorded no-show. The message escalates with the offence
 * count: 1 = warning, 2 = account restriction warning, 3 = account suspended.
 */
export async function sendBwgNoShowWhatsApp(
  pickupId: string,
  noShowCount: number,
) {
  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, scheduled_slot")
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const phone = await resolveBwgPhone(pickupId);
  if (!phone) {
    console.warn(`[BWG WhatsApp] No phone for pickup ${pickupId} (profile or org contact)`);
    return;
  }

  const ctx = await getPickupWhatsAppContext(supabase, pickupId);
  if (!ctx) {
    console.warn("[BWG WhatsApp] skip: could not load pickup context", { pickupId });
    return;
  }

  const params = { slot: pickup.scheduled_slot };
  const messageId =
    noShowCount >= 3
      ? await sendTemplateBwgAccountSuspended(phone, ctx, params)
      : noShowCount === 2
        ? await sendTemplateBwgNoShowWarning2(phone, ctx, params)
        : await sendTemplateBwgNoShowWarning1(phone, ctx, params);

  if (!messageId) {
    console.error("[BWG WhatsApp] no-show template failed", {
      pickupId,
      phone,
      noShowCount,
    });
  }
}

/**
 * Notify all admins of a BWG no-show so they can instruct the driver on next
 * steps (move to next pickup, head to processor, or return). Mirrors the
 * vehicle-breakdown admin fan-out.
 */
export async function notifyAdminsBwgNoShow(
  pickupId: string,
  noShowCount: number,
): Promise<void> {
  const ctx = await getPickupWhatsAppContext(supabase, pickupId);
  if (!ctx) {
    console.warn("[BwgNoShow] skip admin notify: no context", { pickupId });
    return;
  }

  const { data: pickup } = await supabase
    .from("pickups")
    .select("vehicle_id, organizations(name)")
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const org = pickup.organizations as unknown as { name: string };
  let regNumber = "Unknown vehicle";

  if (pickup.vehicle_id) {
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("registration_number")
      .eq("id", pickup.vehicle_id)
      .single();

    if (vehicle?.registration_number) {
      regNumber = vehicle.registration_number;
    }
  }

  const { data: admins } = await supabase
    .from("profiles")
    .select("phone")
    .eq("role", "admin")
    .not("phone", "is", null);

  for (const admin of admins ?? []) {
    if (!admin.phone) continue;
    const messageId = await sendTemplateAdminBwgNoShow(admin.phone, ctx, {
      orgName: org?.name ?? "BWG",
      regNumber,
      noShowCount,
    });
    if (!messageId) {
      console.error("[BwgNoShow] admin template failed", {
        pickupId,
        phone: admin.phone,
      });
    }
  }
}

export async function sendBwgPickupCollectedWhatsApp(pickupId: string) {
  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, scheduled_slot")
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const phone = await resolveBwgPhone(pickupId);
  if (!phone) {
    console.warn(`[BWG WhatsApp] No phone for pickup ${pickupId} (profile or org contact)`);
    return;
  }

  const ctx = await getPickupWhatsAppContext(supabase, pickupId);
  if (!ctx) {
    console.warn("[BWG WhatsApp] skip: could not load pickup context", { pickupId });
    return;
  }

  const messageId = await sendTemplateBwgPickupCollected(phone, ctx, {
    slot: pickup.scheduled_slot,
  });
  if (!messageId) {
    console.error("[BWG WhatsApp] pickup collected template failed", {
      pickupId,
      phone,
    });
  }
}

export async function sendBwgPartialPickupWhatsApp(pickupId: string) {
  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, pickup_number, scheduled_slot")
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const phone = await resolveBwgPhone(pickupId);
  if (!phone) {
    console.warn(`[BWG WhatsApp] No phone for pickup ${pickupId} (profile or org contact)`);
    return;
  }

  const ctx = await getPickupWhatsAppContext(supabase, pickupId);
  if (!ctx) {
    console.warn("[BWG WhatsApp] skip: could not load pickup context", { pickupId });
    return;
  }

  const messageId = await sendTemplateBwgPickupPartial(phone, ctx, {
    pickupNumber: pickup.pickup_number ?? ctx.jobNumber,
    slot: pickup.scheduled_slot,
  });
  if (!messageId) {
    console.error("[BWG WhatsApp] partial pickup template failed", {
      pickupId,
      phone,
    });
  }
}

export async function notifyVehicleBreakdown(pickupId: string): Promise<void> {
  const ctx = await getPickupWhatsAppContext(supabase, pickupId);
  if (!ctx) {
    console.warn("[VehicleBreakdown] skip notify: no context", { pickupId });
    return;
  }

  const { data: pickup } = await supabase
    .from("pickups")
    .select(
      "pickup_number, scheduled_slot, vehicle_id, organizations(name)",
    )
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const org = pickup.organizations as unknown as { name: string };
  let regNumber = "Unknown vehicle";

  if (pickup.vehicle_id) {
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("registration_number")
      .eq("id", pickup.vehicle_id)
      .single();

    if (vehicle?.registration_number) {
      regNumber = vehicle.registration_number;
    }
  }

  const { data: admins } = await supabase
    .from("profiles")
    .select("phone")
    .eq("role", "admin")
    .not("phone", "is", null);

  for (const admin of admins ?? []) {
    if (!admin.phone) continue;
    const messageId = await sendTemplateAdminVehicleBreakdown(admin.phone, ctx, {
      orgName: org?.name ?? "BWG",
      regNumber,
    });
    if (!messageId) {
      console.error("[VehicleBreakdown] admin template failed", {
        pickupId,
        phone: admin.phone,
      });
    }
  }

  const phone = await resolveBwgPhone(pickupId);
  if (!phone) {
    console.warn(`[VehicleBreakdown] No BWG phone for pickup ${pickupId}`);
    return;
  }

  const messageId = await sendTemplateBwgVehicleBreakdown(phone, ctx, {
    pickupNumber: pickup.pickup_number ?? ctx.jobNumber,
    slot: pickup.scheduled_slot,
    regNumber,
  });
  if (!messageId) {
    console.error("[VehicleBreakdown] BWG template failed", { pickupId, phone });
  }
}

export async function notifyAdminsPartialPickup(pickupId: string): Promise<void> {
  const ctx = await getPickupWhatsAppContext(supabase, pickupId);
  if (!ctx) {
    console.warn("[PartialPickup] skip admin notify: no context", { pickupId });
    return;
  }

  const { data: pickup } = await supabase
    .from("pickups")
    .select("pickup_number, organizations(name)")
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const org = pickup.organizations as unknown as { name: string };
  const pickupNumber = pickup.pickup_number ?? ctx.jobNumber;

  const { data: admins } = await supabase
    .from("profiles")
    .select("phone")
    .eq("role", "admin")
    .not("phone", "is", null);

  for (const admin of admins ?? []) {
    if (!admin.phone) continue;
    const messageId = await sendTemplateAdminPickupPartial(admin.phone, ctx, {
      pickupNumber,
      orgName: org?.name ?? "BWG",
    });
    if (!messageId) {
      console.error("[PartialPickup] admin template failed", {
        pickupId,
        phone: admin.phone,
      });
    }
  }
}

export async function sendBwgDeliveryWhatsApp(pickupId: string) {
  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, scheduled_date, scheduled_slot")
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const phone = await resolveBwgPhone(pickupId);
  if (!phone) {
    console.warn(`[BWG WhatsApp] No phone for pickup ${pickupId} (profile or org contact)`);
    return;
  }

  const ctx = await getPickupWhatsAppContext(supabase, pickupId);
  if (!ctx) {
    console.warn("[BWG WhatsApp] skip: could not load pickup context", { pickupId });
    return;
  }

  const messageId = await sendTemplateBwgDeliveryConfirmed(phone, ctx, {
    slot: pickup.scheduled_slot,
  });
  if (!messageId) {
    console.error("[BWG WhatsApp] delivery confirmed template failed", {
      pickupId,
      phone,
    });
  }
}

/** @deprecated Use sendBwgPickupWhatsApp */
export const sendBwgPickupEmail = sendBwgPickupWhatsApp;

/** @deprecated Use sendBwgDeliveryWhatsApp */
export const sendBwgDeliveryEmail = sendBwgDeliveryWhatsApp;
