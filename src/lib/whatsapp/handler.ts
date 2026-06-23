import { createAdminClient } from "@/lib/supabase/admin";
import {
  COLLECTOR_ACTION_PROMPT,
} from "./templates";
import {
  normalizeCollectorWhatsAppChoice,
  normalizeFarmerWhatsAppChoice,
  normalizeBwgWhatsAppChoice,
  sendTemplateFarmerDeliveryConfirm,
  sendTemplateFarmerDeliveryEta,
} from "./wa-templates";
import {
  sendBwgDeliveryWhatsApp,
  sendBwgPartialPickupWhatsApp,
  sendBwgPickupCancelledWhatsApp,
  sendBwgPickupCollectedWhatsApp,
  notifyAdminsPartialPickup,
  sendJobAssignedNotification,
} from "./notifications";
import { getPickupWhatsAppContext } from "./pickup-context";
import { COLLECTOR_ACTIVE_STATUSES } from "@/lib/pickup-status-flow";
import { getETA } from "@/lib/google/distance-matrix";
import type { PickupStatus } from "@/types/enums";
import type { WhatsAppButton, WhatsAppHandlerReply } from "./types";
import { COLLECTOR_SESSION_NEXT } from "./types";

const supabase = createAdminClient();

interface WebhookMessage {
  From: string;
  Body: string;
  NumMedia: string;
  MediaId?: string;
  MediaContentType0?: string;
  ButtonPayload?: string;
}

type PickupRow = {
  id: string;
  status: PickupStatus;
  organization_id: string;
  farmer_id: string | null;
  scheduled_date: string;
  scheduled_slot: string | null;
  estimated_weight_kg: number | null;
  vehicle_id: string | null;
  requested_by: string;
};

const COLLECTOR_ACTIONS: PickupStatus[] = [
  "driver_accepted",
  "enroute",
  "arrived_bwg",
  "full_pickup",
  "partial_pickup",
  "in_transit",
  "arrived_processor",
];

const ALLOWED_FROM: Record<string, PickupStatus[]> = {
  driver_accepted: ["assigned"],
  enroute: ["assigned", "driver_accepted"],
  arrived_bwg: ["enroute"],
  full_pickup: ["arrived_bwg"],
  partial_pickup: ["arrived_bwg"],
  in_transit: ["full_pickup", "partial_pickup"],
  arrived_processor: ["in_transit"],
};

function text(message: string): WhatsAppHandlerReply {
  return { kind: "text", message };
}

function withSessionButtons(
  message: string,
  buttons: WhatsAppButton[],
): WhatsAppHandlerReply {
  return {
    kind: "text",
    message,
    followUps: [
      { kind: "buttons", message: COLLECTOR_ACTION_PROMPT, buttons },
    ],
  };
}

function extractPhone(from: string): string {
  return from.replace("whatsapp:", "").replace("+", "");
}

async function findProfileByPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const variants = [digits, `+${digits}`];
  if (digits.startsWith("91") && digits.length > 10) {
    variants.push(digits.slice(2), `+${digits.slice(2)}`);
  }

  const { data } = await supabase
    .from("profiles")
    .select("id, role, phone, full_name")
    .in("phone", variants)
    .limit(1)
    .single();

  return data;
}

async function getCollectorVehicleIds(profileId: string): Promise<string[]> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", profileId)
    .single();

  if (!profile?.phone) return [];

  const phone = profile.phone.replace(/\D/g, "");
  const { data: drivers } = await supabase
    .from("drivers")
    .select("id")
    .or(`phone.eq.${phone},phone.eq.+${phone}`);

  if (!drivers?.length) return [];

  const driverIds = drivers.map((d) => d.id);
  const { data: vds } = await supabase
    .from("vehicle_drivers")
    .select("vehicle_id")
    .in("driver_id", driverIds);

  return vds?.map((v) => v.vehicle_id) ?? [];
}

async function findActiveCollectorPickup(profileId: string): Promise<PickupRow | null> {
  const vehicleIds = await getCollectorVehicleIds(profileId);
  if (!vehicleIds.length) return null;

  const { data } = await supabase
    .from("pickups")
    .select(
      "id, status, organization_id, farmer_id, scheduled_date, scheduled_slot, estimated_weight_kg, vehicle_id, requested_by"
    )
    .in("status", COLLECTOR_ACTIVE_STATUSES)
    .in("vehicle_id", vehicleIds)
    .order("scheduled_date", { ascending: true })
    .limit(1)
    .single();

  return data as PickupRow | null;
}

async function transitionPickup(
  pickupId: string,
  profileId: string,
  newStatus: PickupStatus,
  notes: string,
  extraUpdate: Record<string, unknown> = {}
): Promise<boolean> {
  const { error } = await supabase
    .from("pickups")
    .update({ status: newStatus, ...extraUpdate })
    .eq("id", pickupId);

  if (error) {
    console.error("[WhatsApp] pickup update failed", { pickupId, newStatus, error });
    return false;
  }

  await supabase.from("pickup_events").insert({
    pickup_id: pickupId,
    status: newStatus,
    changed_by: profileId,
    notes,
  });

  return true;
}

async function findAwaitingProcessorAcceptance(farmerId: string) {
  const { data } = await supabase
    .from("pickups")
    .select("id, status, organization_id, scheduled_date, scheduled_slot, delivered_at")
    .eq("farmer_id", farmerId)
    .eq("status", "arrived_processor")
    .order("delivered_at", { ascending: false })
    .limit(1)
    .single();

  return data;
}

async function notifyProcessorETA(pickup: PickupRow) {
  if (!pickup.farmer_id) return;

  const [farmerResult, orgResult, vehicleResult] = await Promise.all([
    supabase
      .from("farmer_details")
      .select("farm_lat, farm_lng")
      .eq("profile_id", pickup.farmer_id)
      .single(),
    supabase
      .from("organizations")
      .select("lat, lng")
      .eq("id", pickup.organization_id)
      .single(),
    pickup.vehicle_id
      ? supabase
          .from("vehicles")
          .select("registration_number")
          .eq("id", pickup.vehicle_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const farmer = farmerResult.data;
  const org = orgResult.data;
  const vehicle = vehicleResult.data;

  if (!farmer?.farm_lat || !farmer?.farm_lng || !org?.lat || !org?.lng) return;

  const eta = await getETA(org.lat, org.lng, farmer.farm_lat, farmer.farm_lng);

  const { data: farmerProfile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", pickup.farmer_id)
    .single();

  if (!farmerProfile?.phone) return;

  const ctx = await getPickupWhatsAppContext(supabase, pickup.id);
  if (!ctx) return;

  await sendTemplateFarmerDeliveryEta(farmerProfile.phone, ctx, {
    etaMinutes: eta?.durationMinutes ?? 30,
    regNumber: vehicle?.registration_number ?? "N/A",
  });
}

async function notifyProcessorAcceptDelivery(farmerId: string, pickupId: string) {
  const ctx = await getPickupWhatsAppContext(supabase, pickupId);
  if (!ctx) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", farmerId)
    .single();

  if (!profile?.phone) return;

  await sendTemplateFarmerDeliveryConfirm(profile.phone, ctx);
}

function sessionReplyAfterStatus(
  newStatus: PickupStatus,
  message: string
): WhatsAppHandlerReply {
  const next = COLLECTOR_SESSION_NEXT[newStatus];
  if (!next) return text(message);
  return withSessionButtons(message, next);
}

async function handleCollectorAction(
  profileId: string,
  action: PickupStatus
): Promise<WhatsAppHandlerReply> {
  const pickup = await findActiveCollectorPickup(profileId);
  if (!pickup) return text("No active pickup found.");

  const allowedFrom = ALLOWED_FROM[action];
  if (!allowedFrom?.includes(pickup.status)) {
    const next = COLLECTOR_SESSION_NEXT[pickup.status];
    if (next) {
      return withSessionButtons(
        "That action is not available for your current pickup step.",
        next
      );
    }
    return text("That action is not available for your current pickup step.");
  }

  const statusNotes: Record<string, string> = {
    driver_accepted: "Driver accepted job via WhatsApp",
    enroute: "Driver enroute to BWG via WhatsApp",
    arrived_bwg: "Driver arrived at BWG via WhatsApp",
    full_pickup: "Full pickup confirmed via WhatsApp",
    partial_pickup: "Partial pickup via WhatsApp — BWG and admin notified to schedule follow-up pickup",
    in_transit: "Driver in transit to processor via WhatsApp",
    arrived_processor: "Driver arrived at processor via WhatsApp",
  };

  const extraUpdate: Record<string, unknown> = {};
  if (action === "arrived_processor") {
    extraUpdate.delivered_at = new Date().toISOString();
  }

  const ok = await transitionPickup(
    pickup.id,
    profileId,
    action,
    statusNotes[action] ?? `Status updated to ${action} via WhatsApp`,
    extraUpdate
  );

  if (!ok) return text("Failed to update pickup status. Please try again.");

  const updated: PickupRow = { ...pickup, status: action };

  if (action === "driver_accepted") {
    return sessionReplyAfterStatus("driver_accepted", "Job accepted. Tap Enroute when heading to the BWG.");
  }

  if (action === "enroute") {
    return sessionReplyAfterStatus("enroute", "Enroute confirmed. Tap Arrived when you reach the BWG.");
  }

  if (action === "arrived_bwg") {
    return sessionReplyAfterStatus(
      "arrived_bwg",
      "Arrival at BWG confirmed. Select Full Pickup or Partial Pickup."
    );
  }

  if (action === "full_pickup") {
    await sendBwgPickupCollectedWhatsApp(pickup.id);
    await notifyProcessorETA(updated);
    return sessionReplyAfterStatus(
      action,
      "Full pickup recorded. BWG and processor have been notified. Tap In Transit when you leave.",
    );
  }

  if (action === "partial_pickup") {
    await sendBwgPartialPickupWhatsApp(pickup.id);
    await notifyAdminsPartialPickup(pickup.id);
    await notifyProcessorETA(updated);
    return sessionReplyAfterStatus(
      action,
      "Partial pickup recorded. BWG and admin have been notified to schedule another pickup for the remainder. Tap In Transit when you leave.",
    );
  }

  if (action === "in_transit") {
    return sessionReplyAfterStatus(
      "in_transit",
      "In transit confirmed. Tap Arrived when you reach the processor."
    );
  }

  if (action === "arrived_processor") {
    await sendBwgDeliveryWhatsApp(pickup.id);
    if (pickup.farmer_id) {
      await notifyProcessorAcceptDelivery(pickup.farmer_id, pickup.id);
    }
    return text(
      "Arrival at processor confirmed. BWG and processor have been notified. Waiting for processor to accept."
    );
  }

  return text("Status updated.");
}

async function handleProcessorResponse(
  profileId: string,
  body: string
): Promise<WhatsAppHandlerReply> {
  const pickup = await findAwaitingProcessorAcceptance(profileId);
  if (!pickup) return text("No delivery awaiting acceptance.");

  const choice = normalizeFarmerWhatsAppChoice(body);

  if (choice === "processor_accepted") {
    await supabase
      .from("pickups")
      .update({
        status: "accepted",
        farmer_responded_at: new Date().toISOString(),
      })
      .eq("id", pickup.id);

    await supabase.from("pickup_events").insert({
      pickup_id: pickup.id,
      status: "accepted",
      changed_by: profileId,
      notes: "Processor accepted delivery via WhatsApp",
    });

    return text("Thank you! Delivery has been marked as accepted.");
  }

  return text("Please tap Accepted to confirm delivery.");
}

async function handleBwgCancelRequest(
  profileId: string,
): Promise<WhatsAppHandlerReply> {
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", profileId);

  const orgIds = memberships?.map((m) => m.organization_id) ?? [];
  if (!orgIds.length) {
    return text("No organization linked to your account.");
  }

  const { data: pickup } = await supabase
    .from("pickups")
    .select("id, pickup_number, status")
    .in("organization_id", orgIds)
    .eq("status", "requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pickup) {
    return text("No pickup request found that can be cancelled.");
  }

  const { error } = await supabase
    .from("pickups")
    .update({ status: "cancelled" })
    .eq("id", pickup.id)
    .eq("status", "requested");

  if (error) {
    console.error("[WhatsApp] BWG cancel pickup failed", { pickupId: pickup.id, error });
    return text("Failed to cancel pickup. Please try again or use the app.");
  }

  await supabase.from("pickup_events").insert({
    pickup_id: pickup.id,
    status: "cancelled",
    changed_by: profileId,
    notes: "Cancelled via WhatsApp",
  });

  await sendBwgPickupCancelledWhatsApp(pickup.id);

  return text(
    `Pickup ${pickup.pickup_number ?? pickup.id} has been cancelled.`,
  );
}

export async function handleIncomingMessage(
  body: WebhookMessage
): Promise<WhatsAppHandlerReply> {
  const phone = extractPhone(body.From);
  const profile = await findProfileByPhone(phone);

  if (!profile) {
    return text("Your phone number is not registered. Please contact admin.");
  }

  const buttonPayload = body.ButtonPayload?.trim() || "";
  const messageBody = body.Body?.trim() || "";

  if (profile.role === "collector") {
    const action = normalizeCollectorWhatsAppChoice(
      buttonPayload || messageBody
    ) as PickupStatus;

    if (COLLECTOR_ACTIONS.includes(action)) {
      return handleCollectorAction(profile.id, action);
    }

    const pickup = await findActiveCollectorPickup(profile.id);
    if (pickup) {
      if (pickup.status === "assigned") {
        await sendJobAssignedNotification(pickup.id);
        return text(
          "Please tap Accepted on the job message above to accept this pickup.",
        );
      }

      const next = COLLECTOR_SESSION_NEXT[pickup.status];
      if (next) {
        return withSessionButtons(COLLECTOR_ACTION_PROMPT, next);
      }
    }

    return text("No active pickup assigned to you.");
  }

  if (profile.role === "bwg") {
    const choice = normalizeBwgWhatsAppChoice(buttonPayload || messageBody);
    if (choice === "cancel_pickup") {
      return handleBwgCancelRequest(profile.id);
    }
    return text(
      "Tap Cancel on your pickup request message to withdraw it, or use the GreensBrowns app.",
    );
  }

  if (profile.role === "farmer") {
    const input = normalizeFarmerWhatsAppChoice(buttonPayload || messageBody);

    if (input === "processor_accepted") {
      return handleProcessorResponse(profile.id, input);
    }

    return text("Please tap Accepted to confirm delivery.");
  }

  return text("Your role does not support WhatsApp interactions yet.");
}
