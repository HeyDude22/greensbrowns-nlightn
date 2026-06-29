import { createAdminClient } from "@/lib/supabase/admin";
import {
  COLLECTOR_ACTION_PROMPT,
} from "./templates";
import {
  normalizeCollectorWhatsAppChoice,
  normalizeFarmerWhatsAppChoice,
  sendTemplateFarmerDeliveryConfirm,
  sendTemplateFarmerDeliveryEta,
} from "./wa-templates";
import {
  sendBwgDeliveryWhatsApp,
  sendBwgPartialPickupWhatsApp,
  sendBwgPickupCollectedWhatsApp,
  sendBwgVehicleArrivedWhatsApp,
  sendBwgNoShowWhatsApp,
  notifyAdminsBwgNoShow,
  notifyAdminsPartialPickup,
  sendJobAssignedNotification,
  notifyVehicleBreakdown,
} from "./notifications";
import { handleBwgMessage } from "./bwg-conversation";
import { handleGuestMessage } from "./guest-conversation";
import { getConversation } from "./conversation-state";
import {
  isPhoneBlocked,
  recordRateEvent,
  isOverMessageRate,
  isOptInKeyword,
} from "./abuse-guard";
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
  Latitude?: number;
  Longitude?: number;
  LocationAddress?: string;
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
    kind: "buttons",
    message: `${message}\n\n${COLLECTOR_ACTION_PROMPT}`,
    buttons,
  };
}

function sessionButtonsOnly(buttons: WhatsAppButton[]): WhatsAppHandlerReply {
  return {
    kind: "buttons",
    message: COLLECTOR_ACTION_PROMPT,
    buttons,
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

async function findPickupForBreakdown(profileId: string): Promise<PickupRow | null> {
  const vehicleIds = await getCollectorVehicleIds(profileId);
  if (!vehicleIds.length) return null;

  const { data } = await supabase
    .from("pickups")
    .select(
      "id, status, organization_id, farmer_id, scheduled_date, scheduled_slot, estimated_weight_kg, vehicle_id, requested_by"
    )
    .in("status", ["driver_accepted", "enroute"])
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
    return sessionReplyAfterStatus(
      "driver_accepted",
      "Job accepted. Tap Enroute when heading to the BWG, or Breakdown if your vehicle has a problem.",
    );
  }

  if (action === "enroute") {
    return sessionReplyAfterStatus(
      "enroute",
      "Enroute confirmed. Tap Arrived when you reach the BWG, or Breakdown if your vehicle has a problem.",
    );
  }

  if (action === "arrived_bwg") {
    await sendBwgVehicleArrivedWhatsApp(pickup.id);
    return sessionReplyAfterStatus(
      "arrived_bwg",
      "Arrival at BWG confirmed and the BWG has been notified. Select Full Pickup or Partial Pickup, or tap BWG Unavailable if no one is available."
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

async function handleCollectorBreakdown(
  profileId: string,
): Promise<WhatsAppHandlerReply> {
  const pickup = await findPickupForBreakdown(profileId);
  if (!pickup) {
    const assigned = await findActiveCollectorPickup(profileId);
    if (assigned?.status === "assigned") {
      return text(
        "Please tap Accepted on the job message before reporting a breakdown.",
      );
    }
    return text("No pickup is active for a breakdown report.");
  }

  const ok = await transitionPickup(
    pickup.id,
    profileId,
    "breakdown",
    "Vehicle breakdown reported via WhatsApp",
  );

  if (!ok) {
    return text("Failed to report breakdown. Please try again.");
  }

  await notifyVehicleBreakdown(pickup.id);

  return text(
    "Breakdown reported. Admin and the BWG have been notified. Stand by for reassignment.",
  );
}

/**
 * Release the vehicle from the job when the only grouped pickup is closed.
 * Multi-pickup and carries-waste-to-processor flows are intentionally not
 * built yet (see product spec); those jobs are left untouched for now.
 */
async function releaseVehicleIfSolePickup(pickupId: string): Promise<void> {
  const { data: link } = await supabase
    .from("job_pickups")
    .select("job_id")
    .eq("pickup_id", pickupId)
    .maybeSingle();

  if (!link?.job_id) return;

  const { count } = await supabase
    .from("job_pickups")
    .select("id", { count: "exact", head: true })
    .eq("job_id", link.job_id);

  if ((count ?? 0) <= 1) {
    await supabase
      .from("jobs")
      .update({ status: "cancelled" })
      .eq("id", link.job_id);
  }
}

/**
 * Record a no-show against the organization. no_show_count escalates
 * NULL -> 1 -> 2 -> 3; the third offence suspends the account (is_active=false).
 * Returns the new offence count.
 */
async function recordOrgNoShow(organizationId: string): Promise<number> {
  const { data: org } = await supabase
    .from("organizations")
    .select("no_show_count")
    .eq("id", organizationId)
    .single();

  const newCount = (org?.no_show_count ?? 0) + 1;
  const update: Record<string, unknown> = { no_show_count: newCount };
  if (newCount >= 3) update.is_active = false;

  const { error } = await supabase
    .from("organizations")
    .update(update)
    .eq("id", organizationId);

  if (error) {
    console.error("[WhatsApp] no-show update failed", { organizationId, error });
  }

  return newCount;
}

async function handleBwgUnavailable(
  profileId: string,
): Promise<WhatsAppHandlerReply> {
  const pickup = await findActiveCollectorPickup(profileId);
  if (!pickup) return text("No active pickup found.");

  if (pickup.status !== "arrived_bwg") {
    return text(
      "BWG Unavailable can only be reported after you tap Arrived at the BWG.",
    );
  }

  const ok = await transitionPickup(
    pickup.id,
    profileId,
    "bwg_unavailable",
    "BWG unavailable (no-show) reported by collector via WhatsApp",
  );

  if (!ok) {
    return text("Failed to report BWG unavailable. Please try again.");
  }

  await releaseVehicleIfSolePickup(pickup.id);

  const noShowCount = await recordOrgNoShow(pickup.organization_id);
  await sendBwgNoShowWhatsApp(pickup.id, noShowCount);
  await notifyAdminsBwgNoShow(pickup.id, noShowCount);

  return text(
    "Recorded as BWG Unavailable. This pickup is now closed. You may leave the BWG premises and contact admin for further instructions.",
  );
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

export async function handleIncomingMessage(
  body: WebhookMessage
): Promise<WhatsAppHandlerReply> {
  const phone = extractPhone(body.From);

  // Abuse controls (run before any work): drop blocked phones silently, and
  // throttle senders that exceed the inbound message rate. Silent drops avoid
  // amplifying outbound (billable) replies during a flood.
  if (await isPhoneBlocked(supabase, phone)) {
    console.warn("[WhatsApp] dropping message from blocked phone", { phone });
    return { kind: "none" };
  }
  await recordRateEvent(supabase, phone, "message");
  if (await isOverMessageRate(supabase, phone)) {
    console.warn("[WhatsApp] message rate limit exceeded", { phone });
    return { kind: "none" };
  }

  const buttonPayload = body.ButtonPayload?.trim() || "";
  const messageBody = body.Body?.trim() || "";

  const profile = await findProfileByPhone(phone);

  // Non-registered senders can run the guest one-off pickup flow. Require an
  // explicit opt-in keyword to start (avoids replying to random/spam texts),
  // but always continue an already in-progress guest conversation.
  if (!profile) {
    const convo = await getConversation(supabase, phone);
    if (
      convo?.flow === "guest_one_off" ||
      isOptInKeyword(buttonPayload || messageBody)
    ) {
      return handleGuestMessage({
        phone,
        text: messageBody,
        buttonPayload,
        mediaId: body.MediaId ?? "",
        mediaType: body.MediaContentType0 ?? "",
        latitude: body.Latitude,
        longitude: body.Longitude,
      });
    }
    return text(
      "Your phone number is not registered. Reply 'pickup' to request a one-off waste collection.",
    );
  }

  if (profile.role === "collector") {
    const choice = normalizeCollectorWhatsAppChoice(
      buttonPayload || messageBody,
    );

    if (choice === "breakdown") {
      return handleCollectorBreakdown(profile.id);
    }

    if (choice === "bwg_unavailable") {
      return handleBwgUnavailable(profile.id);
    }

    const action = choice as PickupStatus;

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
        return sessionButtonsOnly(next);
      }
    }

    return text("No active pickup assigned to you.");
  }

  if (profile.role === "bwg") {
    return handleBwgMessage({
      phone,
      profileId: profile.id,
      profileName: profile.full_name ?? null,
      text: messageBody,
      buttonPayload,
      mediaId: body.MediaId ?? "",
      mediaType: body.MediaContentType0 ?? "",
    });
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
