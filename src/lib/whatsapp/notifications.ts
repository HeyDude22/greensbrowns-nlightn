import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage, sendWhatsAppButtons } from "./client";
import {
  jobAssignedMessage,
  pickupReminder24hMessage,
  pickupReminder1hMessage,
  farmerDeliveryIncomingMessage,
  bwgPickupScheduledMessage,
  bwgDeliveryConfirmedMessage,
  COLLECTOR_ACTION_PROMPT,
} from "./templates";
import { COLLECTOR_ACTION_BUTTONS } from "./types";

const supabase = createAdminClient();

export async function sendCollectorActionButtons(phone: string, body?: string) {
  await sendWhatsAppButtons(
    phone,
    body ?? COLLECTOR_ACTION_PROMPT,
    COLLECTOR_ACTION_BUTTONS
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

  const message = jobAssignedMessage({
    orgName: org.name,
    address: org.address,
    date: pickup.scheduled_date,
    slot: pickup.scheduled_slot,
    lat: org.lat,
    lng: org.lng,
  });

  for (const vd of vehicleDrivers) {
    const driver = vd.drivers as unknown as { name: string; phone: string | null };
    if (driver?.phone) {
      await sendWhatsAppMessage(driver.phone, message);
      await sendCollectorActionButtons(driver.phone);
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
    .eq("status", "assigned");

  if (!pickups?.length) return;

  for (const pickup of pickups) {
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

      const templateFn =
        type === "24h" ? pickupReminder24hMessage : pickupReminder1hMessage;
      const message = templateFn({
        orgName: org.name,
        slot: pickup.scheduled_slot,
        lat: org.lat,
        lng: org.lng,
      });

      for (const vd of vehicleDrivers || []) {
        const driver = vd.drivers as unknown as { name: string; phone: string | null };
        if (driver?.phone) {
          await sendWhatsAppMessage(driver.phone, message);
          await sendCollectorActionButtons(driver.phone);
        }
      }
    }

    if (type === "24h" && pickup.farmer_id) {
      const { data: farmerProfile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", pickup.farmer_id)
        .single();

      if (farmerProfile?.phone && pickup.vehicle_id) {
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

        const message = farmerDeliveryIncomingMessage({
          slot: pickup.scheduled_slot,
          collectorName: driverName,
          weightKg: pickup.estimated_weight_kg,
          regNumber: vehicle?.registration_number ?? "N/A",
        });

        await sendWhatsAppMessage(farmerProfile.phone, message);
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

  await sendWhatsAppMessage(
    phone,
    bwgPickupScheduledMessage({
      date: pickup.scheduled_date,
      slot: pickup.scheduled_slot,
    })
  );
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

  await sendWhatsAppMessage(
    phone,
    bwgDeliveryConfirmedMessage({
      date: pickup.scheduled_date,
      slot: pickup.scheduled_slot,
    })
  );
}

/** @deprecated Use sendBwgPickupWhatsApp */
export const sendBwgPickupEmail = sendBwgPickupWhatsApp;

/** @deprecated Use sendBwgDeliveryWhatsApp */
export const sendBwgDeliveryEmail = sendBwgDeliveryWhatsApp;
