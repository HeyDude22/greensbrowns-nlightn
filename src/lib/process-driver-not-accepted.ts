import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateAdminDriverNotAccepted } from "@/lib/whatsapp/wa-templates";
import { getPickupWhatsAppContext } from "@/lib/whatsapp/pickup-context";

const ACCEPTANCE_TIMEOUT_MS = 120 * 60 * 1000;

export async function processDriverNotAcceptedTimeouts(): Promise<number> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - ACCEPTANCE_TIMEOUT_MS).toISOString();

  const { data: pickups, error } = await supabase
    .from("pickups")
    .select("id, vehicle_id, organization_id, organizations(name)")
    .eq("status", "assigned");

  if (error) {
    console.error("[DriverNotAccepted] query error", error);
    throw error;
  }

  if (!pickups?.length) return 0;

  let count = 0;

  for (const pickup of pickups) {
    const { data: event } = await supabase
      .from("pickup_events")
      .select("created_at")
      .eq("pickup_id", pickup.id)
      .eq("status", "assigned")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!event || event.created_at > cutoff) continue;

    const { error: updateError } = await supabase
      .from("pickups")
      .update({ status: "driver_not_accepted" })
      .eq("id", pickup.id)
      .eq("status", "assigned");

    if (updateError) {
      console.error("[DriverNotAccepted] update failed", {
        pickupId: pickup.id,
        error: updateError,
      });
      continue;
    }

    await supabase.from("pickup_events").insert({
      pickup_id: pickup.id,
      status: "driver_not_accepted",
      changed_by: null,
      notes: "Collector did not accept within 120 minutes",
    });

    await notifyAdminsDriverNotAccepted(pickup.id);
    count++;
  }

  return count;
}

export async function notifyAdminsDriverNotAccepted(pickupId: string): Promise<void> {
  const supabase = createAdminClient();

  const ctx = await getPickupWhatsAppContext(supabase, pickupId);
  if (!ctx) {
    console.warn("[DriverNotAccepted] skip admin notify: no context", { pickupId });
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
    const messageId = await sendTemplateAdminDriverNotAccepted(admin.phone, ctx, {
      orgName: org?.name ?? "BWG",
      regNumber,
    });
    if (!messageId) {
      console.error("[DriverNotAccepted] admin template failed", {
        pickupId,
        phone: admin.phone,
      });
    }
  }
}
