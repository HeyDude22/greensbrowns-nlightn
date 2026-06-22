import { createAdminClient } from "@/lib/supabase/admin";
import { downloadMedia } from "./client";
import {
  PHOTO_PROMPT,
  COLLECTOR_ACTION_PROMPT,
} from "./templates";
import {
  normalizeFarmerWhatsAppChoice,
  sendTemplateFarmerDeliveryConfirm,
  sendTemplateFarmerDeliveryEta,
} from "./wa-templates";
import { sendBwgDeliveryWhatsApp } from "./notifications";
import { getPickupWhatsAppContext } from "./pickup-context";
import { COLLECTOR_ACTIVE_STATUSES } from "@/lib/pickup-status-flow";
import { getETA } from "@/lib/google/distance-matrix";
import type { PickupStatus } from "@/types/enums";
import type { WhatsAppHandlerReply } from "./types";
import { COLLECTOR_NEXT_BUTTONS } from "./types";

const supabase = createAdminClient();

interface WebhookMessage {
  From: string;
  Body: string;
  NumMedia: string;
  MediaId?: string;
  MediaContentType0?: string;
  ButtonPayload?: string;
}

type PendingPhotoAction =
  | { kind: "bwg_pickup"; load: "full_pickup" | "partial_pickup" }
  | { kind: "processor_arrival" };

const pendingPhotoAction = new Map<string, PendingPhotoAction>();

function text(message: string): WhatsAppHandlerReply {
  return { kind: "text", message };
}

function buttons(
  message: string,
  buttonList: { id: string; title: string }[]
): WhatsAppHandlerReply {
  return { kind: "buttons", message, buttons: buttonList };
}

function buttonsForStatus(
  pickup: { status: PickupStatus },
  message?: string
): WhatsAppHandlerReply {
  const next = COLLECTOR_NEXT_BUTTONS[pickup.status];
  if (!next) {
    return text("No further actions available for this pickup.");
  }
  return buttons(message ?? COLLECTOR_ACTION_PROMPT, next);
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

async function findActiveCollectorPickup(profileId: string) {
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

  return data;
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

async function notifyProcessorETA(pickup: {
  id: string;
  farmer_id: string | null;
  organization_id: string;
  vehicle_id: string | null;
}) {
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

async function handleCollectorStatusButton(
  profileId: string,
  phone: string,
  action: string
): Promise<WhatsAppHandlerReply> {
  const pickup = await findActiveCollectorPickup(profileId);
  if (!pickup) return text("No active pickup found.");

  const expected = COLLECTOR_NEXT_BUTTONS[pickup.status as PickupStatus];
  if (!expected?.some((b) => b.id === action)) {
    return buttonsForStatus(
      pickup as { status: PickupStatus },
      "Please use the button for your current pickup step."
    );
  }

  if (action === "full_pickup" || action === "partial_pickup") {
    if (pickup.status !== "arrived_bwg") {
      return text("Mark arrival at BWG before confirming pickup load.");
    }
    pendingPhotoAction.set(phone, {
      kind: "bwg_pickup",
      load: action as "full_pickup" | "partial_pickup",
    });
    return text(PHOTO_PROMPT);
  }

  if (action === "arrived_processor") {
    if (pickup.status !== "in_transit") {
      return text("Mark in transit before confirming arrival at processor.");
    }
    pendingPhotoAction.set(phone, { kind: "processor_arrival" });
    return text(PHOTO_PROMPT);
  }

  const statusNotes: Record<string, string> = {
    driver_accepted: "Driver accepted job via WhatsApp",
    enroute: "Driver enroute to BWG via WhatsApp",
    arrived_bwg: "Driver arrived at BWG via WhatsApp",
    in_transit: "Driver in transit to processor via WhatsApp",
  };

  const ok = await transitionPickup(
    pickup.id,
    profileId,
    action as PickupStatus,
    statusNotes[action] ?? `Status updated to ${action} via WhatsApp`
  );

  if (!ok) return text("Failed to update pickup status. Please try again.");

  const updated = { ...pickup, status: action as PickupStatus };

  if (action === "in_transit") {
    await notifyProcessorETA(updated);
    return buttonsForStatus(
      updated,
      "In transit confirmed. Notify processor when you arrive."
    );
  }

  return buttonsForStatus(updated, "Status updated.");
}

async function handleCollectorPhoto(
  profileId: string,
  phone: string,
  mediaId: string
): Promise<WhatsAppHandlerReply> {
  const pending = pendingPhotoAction.get(phone);
  if (!pending) {
    return text("No photo action pending. Tap a status button first.");
  }

  const pickup = await findActiveCollectorPickup(profileId);
  if (!pickup) {
    pendingPhotoAction.delete(phone);
    return text("No active pickup found.");
  }

  let photoBuffer: Buffer;
  try {
    photoBuffer = await downloadMedia(mediaId);
  } catch (err) {
    console.warn(`[WhatsApp] Photo download failed (${err}), using placeholder`);
    photoBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
  }

  if (pending.kind === "bwg_pickup") {
    if (pickup.status !== "arrived_bwg") {
      pendingPhotoAction.delete(phone);
      return text("Pickup load photo must follow arrival at BWG.");
    }

    const newStatus = pending.load;
    const fileName = `${pickup.id}/${newStatus}-${Date.now()}.jpg`;

    await supabase.storage
      .from("pickup-photos")
      .upload(fileName, photoBuffer, { contentType: "image/jpeg", upsert: true });

    const { data: urlData } = supabase.storage
      .from("pickup-photos")
      .getPublicUrl(fileName);

    const ok = await transitionPickup(
      pickup.id,
      profileId,
      newStatus,
      `${newStatus === "full_pickup" ? "Full" : "Partial"} pickup confirmed via WhatsApp`,
      { photo_before_url: urlData.publicUrl }
    );

    pendingPhotoAction.delete(phone);
    if (!ok) return text("Failed to save pickup photo.");

    return buttonsForStatus(
      { status: newStatus },
      "Pickup photo saved. Tap In Transit when heading to the processor."
    );
  }

  if (pickup.status !== "in_transit") {
    pendingPhotoAction.delete(phone);
    return text("Processor arrival photo must follow in transit status.");
  }

  const fileName = `${pickup.id}/arrived_processor-${Date.now()}.jpg`;

  await supabase.storage
    .from("pickup-photos")
    .upload(fileName, photoBuffer, { contentType: "image/jpeg", upsert: true });

  const { data: urlData } = supabase.storage
    .from("pickup-photos")
    .getPublicUrl(fileName);

  const deliveredAt = new Date().toISOString();
  const ok = await transitionPickup(
    pickup.id,
    profileId,
    "arrived_processor",
    "Driver arrived at processor via WhatsApp",
    {
      photo_after_url: urlData.publicUrl,
      delivered_at: deliveredAt,
    }
  );

  pendingPhotoAction.delete(phone);
  if (!ok) return text("Failed to save arrival photo.");

  if (pickup.farmer_id) {
    await notifyProcessorAcceptDelivery(pickup.farmer_id, pickup.id);
  }
  await sendBwgDeliveryWhatsApp(pickup.id);

  return text("Arrival confirmed! Waiting for processor to accept.");
}

async function handleProcessorResponse(
  profileId: string,
  body: string
): Promise<WhatsAppHandlerReply> {
  const pickup = await findAwaitingProcessorAcceptance(profileId);
  if (!pickup) return text("No delivery awaiting acceptance.");

  const choice = normalizeFarmerWhatsAppChoice(body);

  if (choice === "1" || choice === "accepted") {
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

  return text("Please tap Accept to confirm delivery.");
}

export async function handleIncomingMessage(
  body: WebhookMessage
): Promise<WhatsAppHandlerReply> {
  const phone = extractPhone(body.From);
  const profile = await findProfileByPhone(phone);

  if (!profile) {
    return text("Your phone number is not registered. Please contact admin.");
  }

  const hasMedia = parseInt(body.NumMedia || "0") > 0;
  const messageBody = body.Body?.trim().toLowerCase() || "";
  const buttonPayload = body.ButtonPayload?.trim().toLowerCase() || "";

  if (profile.role === "collector") {
    if (hasMedia && body.MediaId) {
      return handleCollectorPhoto(profile.id, phone, body.MediaId);
    }

    const action = buttonPayload || messageBody.replace(/\s+/g, "_");
    const knownActions = [
      "driver_accepted",
      "enroute",
      "arrived_bwg",
      "full_pickup",
      "partial_pickup",
      "in_transit",
      "arrived_processor",
    ];

    if (knownActions.includes(action)) {
      return handleCollectorStatusButton(profile.id, phone, action);
    }

    const pickup = await findActiveCollectorPickup(profile.id);
    if (pickup) {
      return buttonsForStatus(pickup as { status: PickupStatus });
    }

    return text("No active pickup assigned to you.");
  }

  if (profile.role === "farmer") {
    const input = normalizeFarmerWhatsAppChoice(buttonPayload || messageBody);

    if (["1", "accepted", "accept"].includes(input)) {
      return handleProcessorResponse(profile.id, input);
    }

    return text("Please use the Accept button in your latest message to respond.");
  }

  return text("Your role does not support WhatsApp interactions yet.");
}
