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
  sendTemplateBwgPickupScheduled,
  sendTemplateCollectorJobAssigned,
  sendTemplateCollectorPickupReminder,
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

export async function sendPickupReminders(type: "24h" | "1h") {
  const slotStartHours: Record<string, number> = {
    morning: 6,
    afternoon: 12,
    evening: 16,
  };

  const now = new Date();
  const targetDate = new Date(now);

  if (type === "24h") {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const dateStr = targetDate.toISOString().split("T")[0];

  const istHour = (now.getUTCHours() + 5 + (now.getUTCMinutes() + 30 >= 60 ? 1 : 0)) % 24;
  let targetSlot: string | null = null;

  for (const [slot, hour] of Object.entries(slotStartHours)) {
    if (type === "1h" && istHour === hour - 1) targetSlot = slot;
    if (type === "24h" && istHour === hour) targetSlot = slot;
  }

  if (!targetSlot) return;

  const { data: pickups } = await supabase
    .from("pickups")
    .select(
      "id, scheduled_date, scheduled_slot, vehicle_id, farmer_id, estimated_weight_kg, organization_id, organizations(name, address, lat, lng)"
    )
    .eq("scheduled_date", dateStr)
    .eq("scheduled_slot", targetSlot)
    .in("status", ["assigned", "driver_accepted"]);

  if (!pickups?.length) return;

  for (const pickup of pickups) {
    const ctx = await getPickupWhatsAppContext(supabase, pickup.id);
    if (!ctx) continue;

    const org = pickup.organizations as unknown as {
      name: string;
      address: string;
      lat: number | null;
      lng: number | null;
    };
    if (!org?.lat || !org?.lng) continue;

    if (pickup.vehicle_id) {
      const { data: vehicleDrivers } = await supabase
        .from("vehicle_drivers")
        .select("driver_id, drivers(name, phone)")
        .eq("vehicle_id", pickup.vehicle_id);

      for (const vd of vehicleDrivers || []) {
        const driver = vd.drivers as unknown as { name: string; phone: string | null };
        if (driver?.phone) {
          const messageId = await sendTemplateCollectorPickupReminder(
            driver.phone,
            type,
            ctx,
            {
              orgName: org.name,
              slot: pickup.scheduled_slot,
              lat: org.lat,
              lng: org.lng,
            },
          );
          if (!messageId) {
            console.error(`[Collector Reminder ${type}] template send failed`, {
              pickupId: pickup.id,
              phone: driver.phone,
            });
          }
        }
      }
    }

    if (type === "24h" && pickup.farmer_id) {
      const { data: farmerProfile, error: profileError } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", pickup.farmer_id)
        .single();

      if (profileError) {
        console.error("[Farmer Reminder 24h] profile lookup error", {
          pickupId: pickup.id,
          farmerId: pickup.farmer_id,
          error: profileError.message,
        });
      }

      if (!farmerProfile?.phone) {
        console.warn("[Farmer Reminder 24h] skip: no farmer phone", {
          pickupId: pickup.id,
          farmerId: pickup.farmer_id,
        });
      } else if (!pickup.vehicle_id) {
        console.warn("[Farmer Reminder 24h] skip: no vehicle_id", {
          pickupId: pickup.id,
        });
      } else {
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

        console.log("[Farmer Reminder 24h] sending template", {
          pickupId: pickup.id,
          phone: farmerProfile.phone,
        });

        const messageId = await sendTemplateFarmerDeliveryIncoming(
          farmerProfile.phone,
          ctx,
          {
            slot: pickup.scheduled_slot,
            collectorName: driverName,
            weightKg: pickup.estimated_weight_kg,
            regNumber: vehicle?.registration_number ?? "N/A",
          },
        );

        if (messageId) {
          console.log("[Farmer Reminder 24h] sent", {
            pickupId: pickup.id,
            messageId,
          });
        } else {
          console.error("[Farmer Reminder 24h] send failed", {
            pickupId: pickup.id,
            phone: farmerProfile.phone,
          });
        }
      }
    }
  }
}

// --- BWG WhatsApp notifications ---

async function resolveBwgPhone(pickupId: string): Promise<string | null> {
  const { data: pickup } = await supabase
    .from("pickups")
    .select(
      "id, organization_id, profiles!pickups_requested_by_fkey(phone), organizations(contact_phone)"
    )
    .eq("id", pickupId)
    .single();

  if (!pickup) return null;

  const profile = pickup.profiles as unknown as { phone: string | null };
  const org = pickup.organizations as unknown as { contact_phone: string | null };

  return profile?.phone || org?.contact_phone || null;
}

export async function sendBwgPickupRequestedWhatsApp(pickupId: string) {
  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, pickup_number, scheduled_date, scheduled_slot, organizations(name)")
    .eq("id", pickupId)
    .single();

  if (!pickup) return;

  const phone = await resolveBwgPhone(pickupId);
  if (!phone) {
    console.warn(`[BWG WhatsApp] No phone for pickup ${pickupId} (profile or org contact)`);
    return;
  }

  const org = pickup.organizations as unknown as { name: string };
  const messageId = await sendTemplateBwgPickupRequested(phone, {
    pickupNumber: pickup.pickup_number ?? pickupId,
    orgName: org?.name ?? "—",
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
