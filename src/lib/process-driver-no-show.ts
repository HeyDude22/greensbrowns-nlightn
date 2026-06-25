import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateAdminDriverNoShow } from "@/lib/whatsapp/wa-templates";
import { getPickupWhatsAppContext } from "@/lib/whatsapp/pickup-context";

/**
 * Slot deadline in IST: the driver must mark Arrived by 30 minutes after the
 * slot end. morning (6-12) -> 12:30, afternoon (12-4) -> 16:30, evening
 * (4-8) -> 20:30. Stored as the IST clock time used to build the cutoff.
 */
const SLOT_DEADLINE_IST: Record<string, string> = {
  morning: "12:30",
  afternoon: "16:30",
  evening: "20:30",
};

/** A driver has accepted but not yet arrived at / left the BWG. */
const PENDING_ARRIVAL_STATUSES = ["driver_accepted", "enroute"] as const;

function slotDeadlinePassed(
  scheduledDate: string,
  scheduledSlot: string | null,
  now: Date,
): boolean {
  const hhmm = scheduledSlot ? SLOT_DEADLINE_IST[scheduledSlot] : undefined;
  if (!hhmm) return false;
  // IST is UTC+05:30 — build the cutoff with an explicit offset.
  const deadline = new Date(`${scheduledDate}T${hhmm}:00+05:30`);
  if (Number.isNaN(deadline.getTime())) return false;
  return now.getTime() >= deadline.getTime();
}

export async function processDriverNoShowTimeouts(): Promise<number> {
  const supabase = createAdminClient();
  const now = new Date();

  const { data: pickups, error } = await supabase
    .from("pickups")
    .select("id, vehicle_id, scheduled_date, scheduled_slot, status")
    .in("status", PENDING_ARRIVAL_STATUSES as unknown as string[]);

  if (error) {
    console.error("[DriverNoShow] query error", error);
    throw error;
  }

  if (!pickups?.length) return 0;

  let count = 0;

  for (const pickup of pickups) {
    if (!slotDeadlinePassed(pickup.scheduled_date, pickup.scheduled_slot, now)) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("pickups")
      .update({ status: "driver_no_show" })
      .eq("id", pickup.id)
      .in("status", PENDING_ARRIVAL_STATUSES as unknown as string[]);

    if (updateError) {
      console.error("[DriverNoShow] update failed", {
        pickupId: pickup.id,
        error: updateError,
      });
      continue;
    }

    await supabase.from("pickup_events").insert({
      pickup_id: pickup.id,
      status: "driver_no_show",
      changed_by: null,
      notes: "Driver did not arrive at the BWG by the slot deadline",
    });

    await incrementVehicleDriverNoShow(pickup.vehicle_id);
    await notifyAdminsDriverNoShow(pickup.id);
    count++;
  }

  return count;
}

/** Increment no_show_count for every driver linked to the vehicle. */
async function incrementVehicleDriverNoShow(
  vehicleId: string | null,
): Promise<void> {
  if (!vehicleId) return;
  const supabase = createAdminClient();

  const { data: links } = await supabase
    .from("vehicle_drivers")
    .select("driver_id")
    .eq("vehicle_id", vehicleId);

  for (const link of links ?? []) {
    const { data: driver } = await supabase
      .from("drivers")
      .select("no_show_count")
      .eq("id", link.driver_id)
      .single();

    const newCount = (driver?.no_show_count ?? 0) + 1;
    const { error } = await supabase
      .from("drivers")
      .update({ no_show_count: newCount })
      .eq("id", link.driver_id);

    if (error) {
      console.error("[DriverNoShow] driver count update failed", {
        driverId: link.driver_id,
        error,
      });
    }
  }
}

export async function notifyAdminsDriverNoShow(pickupId: string): Promise<void> {
  const supabase = createAdminClient();

  const ctx = await getPickupWhatsAppContext(supabase, pickupId);
  if (!ctx) {
    console.warn("[DriverNoShow] skip admin notify: no context", { pickupId });
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
  let driverName = "Unknown driver";

  if (pickup.vehicle_id) {
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("registration_number")
      .eq("id", pickup.vehicle_id)
      .single();

    if (vehicle?.registration_number) {
      regNumber = vehicle.registration_number;
    }

    const { data: link } = await supabase
      .from("vehicle_drivers")
      .select("drivers(name)")
      .eq("vehicle_id", pickup.vehicle_id)
      .limit(1)
      .maybeSingle();

    const linkedDriver = link?.drivers as unknown as { name: string } | null;
    if (linkedDriver?.name) {
      driverName = linkedDriver.name;
    }
  }

  const { data: admins } = await supabase
    .from("profiles")
    .select("phone")
    .eq("role", "admin")
    .not("phone", "is", null);

  for (const admin of admins ?? []) {
    if (!admin.phone) continue;
    const messageId = await sendTemplateAdminDriverNoShow(admin.phone, ctx, {
      orgName: org?.name ?? "BWG",
      regNumber,
      driverName,
    });
    if (!messageId) {
      console.error("[DriverNoShow] admin template failed", {
        pickupId,
        phone: admin.phone,
      });
    }
  }
}
