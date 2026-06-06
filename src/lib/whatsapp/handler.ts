import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppButtons, downloadMedia } from "./client";
import {
  PHOTO_PROMPT,
  COLLECTOR_ACTION_PROMPT,
  COLLECTOR_POST_PICKUP_PROMPT,
  COLLECTOR_DELIVERED_PROMPT,
} from "./templates";
import {
  normalizeFarmerWhatsAppChoice,
  sendTemplateFarmerDeliveryConfirm,
  sendTemplateFarmerDeliveryEta,
  sendTemplateFarmerWasteProcessed,
} from "./wa-templates";
import { sendBwgDeliveryWhatsApp } from "./notifications";
import { getETA } from "@/lib/google/distance-matrix";
import type { WhatsAppHandlerReply } from "./types";
import {
  COLLECTOR_PICKED_UP_BUTTON,
  COLLECTOR_POST_PICKUP_BUTTONS,
  COLLECTOR_DELIVERED_BUTTON,
} from "./types";

const supabase = createAdminClient();

interface WebhookMessage {
  From: string;
  Body: string;
  NumMedia: string;
  MediaId?: string;
  MediaContentType0?: string;
  ButtonPayload?: string;
}

type CollectorPhotoStage = "assigned" | "delivery";

function postPickupButtonsReply(message: string): WhatsAppHandlerReply {
  return {
    kind: "text",
    message,
    followUps: [
      {
        kind: "buttons",
        message: COLLECTOR_POST_PICKUP_PROMPT,
        buttons: COLLECTOR_POST_PICKUP_BUTTONS,
      },
    ],
  };
}

function deliveredOnlyButtonsReply(message: string): WhatsAppHandlerReply {
  return {
    kind: "text",
    message,
    followUps: [
      {
        kind: "buttons",
        message: COLLECTOR_DELIVERED_PROMPT,
        buttons: COLLECTOR_DELIVERED_BUTTON,
      },
    ],
  };
}

function text(message: string): WhatsAppHandlerReply {
  return { kind: "text", message };
}

function buttons(
  message: string,
  buttonList: { id: string; title: string }[]
): WhatsAppHandlerReply {
  return { kind: "buttons", message, buttons: buttonList };
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

async function findPickupForCollectorByStatus(
  profileId: string,
  status: "assigned" | "picked_up" | "in_transit"
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", profileId)
    .single();

  if (!profile?.phone) return null;

  const phone = profile.phone.replace(/\D/g, "");
  const { data: drivers } = await supabase
    .from("drivers")
    .select("id")
    .or(`phone.eq.${phone},phone.eq.+${phone}`);

  if (!drivers?.length) return null;

  const driverIds = drivers.map((d) => d.id);
  const { data: vds } = await supabase
    .from("vehicle_drivers")
    .select("vehicle_id")
    .in("driver_id", driverIds);

  if (!vds?.length) return null;

  const vehicleIds = vds.map((v) => v.vehicle_id);

  const { data: pickup } = await supabase
    .from("pickups")
    .select(
      "id, status, organization_id, farmer_id, scheduled_date, scheduled_slot, estimated_weight_kg, vehicle_id, requested_by"
    )
    .eq("status", status)
    .in("vehicle_id", vehicleIds)
    .order("scheduled_date", { ascending: true })
    .limit(1)
    .single();

  return pickup;
}

async function findPickupForDelivery(profileId: string) {
  const inTransit = await findPickupForCollectorByStatus(profileId, "in_transit");
  if (inTransit) return inTransit;
  return findPickupForCollectorByStatus(profileId, "picked_up");
}

async function markPickupInTransit(
  profileId: string,
  pickup: { id: string; requested_by: string }
): Promise<void> {
  await supabase
    .from("pickups")
    .update({ status: "in_transit" })
    .eq("id", pickup.id);

  await supabase.from("pickup_events").insert({
    pickup_id: pickup.id,
    status: "in_transit",
    changed_by: profileId,
    notes: "Marked in transit via WhatsApp",
  });
}

async function findDeliveredPickupForFarmer(farmerId: string) {
  const { data } = await supabase
    .from("pickups")
    .select("id, status, organization_id, scheduled_date, scheduled_slot, delivered_at")
    .eq("farmer_id", farmerId)
    .eq("status", "delivered")
    .order("delivered_at", { ascending: false })
    .limit(1)
    .single();

  return data;
}

async function findPickupAwaitingProcessing(farmerId: string) {
  const { data } = await supabase
    .from("pickups")
    .select("id, status")
    .eq("farmer_id", farmerId)
    .in("status", ["received", "rejected"])
    .order("farmer_responded_at", { ascending: false })
    .limit(1)
    .single();

  return data;
}

async function notifyFarmerWasteProcessed(farmerId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", farmerId)
    .single();

  if (!profile?.phone) return;

  const messageId = await sendTemplateFarmerWasteProcessed(profile.phone);
  if (!messageId) {
    console.error("[Farmer Waste Processed] template send failed", {
      farmerId,
      phone: profile.phone,
    });
  }
}

async function handleCollectorPhoto(
  profileId: string,
  mediaId: string,
  stage: CollectorPhotoStage
): Promise<WhatsAppHandlerReply> {
  const newStatus = stage === "assigned" ? "picked_up" : "delivered";
  const photoField =
    newStatus === "picked_up" ? "photo_before_url" : "photo_after_url";

  const pickup =
    stage === "assigned"
      ? await findPickupForCollectorByStatus(profileId, "assigned")
      : await findPickupForDelivery(profileId);

  if (!pickup) {
    return text(
      stage === "delivery"
        ? "No active delivery found. Mark pickup or in transit first."
        : "No pickup found awaiting your photo."
    );
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
  const fileName = `${pickup.id}/${newStatus}-${Date.now()}.jpg`;

  await supabase.storage
    .from("pickup-photos")
    .upload(fileName, photoBuffer, { contentType: "image/jpeg", upsert: true });

  const { data: urlData } = supabase.storage
    .from("pickup-photos")
    .getPublicUrl(fileName);

  const updateData: Record<string, unknown> = {
    status: newStatus,
    [photoField]: urlData.publicUrl,
  };

  if (newStatus === "delivered") {
    updateData.delivered_at = new Date().toISOString();
  }

  await supabase.from("pickups").update(updateData).eq("id", pickup.id);

  await supabase.from("pickup_events").insert({
    pickup_id: pickup.id,
    status: newStatus,
    changed_by: profileId,
    notes: `Status updated via WhatsApp`,
  });

  if (newStatus === "picked_up" && pickup.farmer_id) {
    console.log("[Collector Photo] picked_up → notifyFarmerETA", {
      pickupId: pickup.id,
      farmerId: pickup.farmer_id,
    });
    await notifyFarmerETA(pickup);
  } else if (newStatus === "picked_up") {
    console.warn("[Collector Photo] picked_up but no farmer_id", {
      pickupId: pickup.id,
    });
  }

  if (newStatus === "delivered" && pickup.farmer_id) {
    console.log("[Collector Photo] delivered → notifyFarmerConfirmDelivery", {
      pickupId: pickup.id,
      farmerId: pickup.farmer_id,
    });
    await notifyFarmerConfirmDelivery(pickup.farmer_id);
    await sendBwgDeliveryWhatsApp(pickup.id);
  } else if (newStatus === "delivered") {
    console.warn("[Collector Photo] delivered but no farmer_id", {
      pickupId: pickup.id,
    });
  }

  if (newStatus === "picked_up") {
    return postPickupButtonsReply(
      "Pickup confirmed! Tap In Transit when en route, or Delivered when you reach the farm."
    );
  }

  return text("Delivery confirmed! Waiting for farmer to accept.");
}

async function notifyFarmerETA(pickup: {
  id: string;
  farmer_id: string | null;
  organization_id: string;
  vehicle_id: string | null;
  estimated_weight_kg: number | null;
}) {
  console.log("[Farmer ETA] start", {
    pickupId: pickup.id,
    farmerId: pickup.farmer_id,
  });

  if (!pickup.farmer_id) {
    console.warn("[Farmer ETA] skip: no farmer_id", { pickupId: pickup.id });
    return;
  }

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

  if (!farmer?.farm_lat || !farmer?.farm_lng || !org?.lat || !org?.lng) {
    console.warn("[Farmer ETA] skip: missing coordinates", {
      pickupId: pickup.id,
      farm_lat: farmer?.farm_lat,
      farm_lng: farmer?.farm_lng,
      org_lat: org?.lat,
      org_lng: org?.lng,
    });
    return;
  }

  const eta = await getETA(org.lat, org.lng, farmer.farm_lat, farmer.farm_lng);

  const { data: farmerProfile, error: profileError } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", pickup.farmer_id)
    .single();

  if (profileError) {
    console.error("[Farmer ETA] profile lookup error", {
      farmerId: pickup.farmer_id,
      error: profileError.message,
    });
  }

  if (!farmerProfile?.phone) {
    console.warn("[Farmer ETA] skip: no farmer phone", {
      pickupId: pickup.id,
      farmerId: pickup.farmer_id,
    });
    return;
  }

  const etaMinutes = eta?.durationMinutes ?? 30;
  const regNumber = vehicle?.registration_number ?? "N/A";

  console.log("[Farmer ETA] sending template", {
    pickupId: pickup.id,
    phone: farmerProfile.phone,
    etaMinutes,
    regNumber,
  });

  const messageId = await sendTemplateFarmerDeliveryEta(farmerProfile.phone, {
    etaMinutes,
    regNumber,
  });

  if (messageId) {
    console.log("[Farmer ETA] sent", { pickupId: pickup.id, messageId });
  } else {
    console.error(
      "[Farmer ETA] send failed (see [WhatsApp] Meta API error above)",
      { pickupId: pickup.id, phone: farmerProfile.phone },
    );
  }
}

async function notifyFarmerConfirmDelivery(farmerId: string) {
  console.log("[Farmer Delivery] start", { farmerId });

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", farmerId)
    .single();

  if (error) {
    console.error("[Farmer Delivery] profile lookup error", {
      farmerId,
      error: error.message,
    });
  }

  if (!profile?.phone) {
    console.warn("[Farmer Delivery] skip: no phone", { farmerId });
    return;
  }

  console.log("[Farmer Delivery] sending template", {
    farmerId,
    phone: profile.phone,
  });

  const messageId = await sendTemplateFarmerDeliveryConfirm(profile.phone);

  if (messageId) {
    console.log("[Farmer Delivery] sent", { farmerId, messageId });
  } else {
    console.error("[Farmer Delivery] send failed", {
      farmerId,
      phone: profile.phone,
    });
  }
}

async function handleFarmerResponse(
  profileId: string,
  body: string
): Promise<WhatsAppHandlerReply> {
  const pickup = await findDeliveredPickupForFarmer(profileId);
  if (!pickup) return text("No pending delivery found.");

  const choice = normalizeFarmerWhatsAppChoice(body);

  type RejectionReason = "mixed_waste" | "capacity_full" | "other";
  const rejectionMap: Record<string, RejectionReason> = {
    "2": "mixed_waste",
    "3": "capacity_full",
    "4": "other",
    reject_mixed: "mixed_waste",
    reject_other: "other",
  };

  if (choice === "1" || choice === "received") {
    await supabase
      .from("pickups")
      .update({
        status: "received",
        farmer_responded_at: new Date().toISOString(),
      })
      .eq("id", pickup.id);

    await supabase.from("pickup_events").insert({
      pickup_id: pickup.id,
      status: "received",
      changed_by: profileId,
      notes: "Farmer confirmed receipt via WhatsApp",
    });

    await notifyFarmerWasteProcessed(profileId);
    return text("Thank you! Please confirm when you have finished processing the waste.");
  }

  if (rejectionMap[choice]) {
    await supabase
      .from("pickups")
      .update({
        status: "rejected",
        rejection_reason: rejectionMap[choice],
        farmer_responded_at: new Date().toISOString(),
      })
      .eq("id", pickup.id);

    await supabase.from("pickup_events").insert({
      pickup_id: pickup.id,
      status: "rejected",
      changed_by: profileId,
      notes: `Farmer rejected: ${rejectionMap[choice]} (via WhatsApp)`,
    });

    await notifyFarmerWasteProcessed(profileId);
    return text(
      `Delivery rejected (${rejectionMap[choice].replace("_", " ")}). Please confirm when waste has been processed.`
    );
  }

  return text("Please tap Received or a Reject option to confirm delivery.");
}

async function handleFarmerWasteProcessed(
  profileId: string
): Promise<WhatsAppHandlerReply> {
  const pickup = await findPickupAwaitingProcessing(profileId);
  if (!pickup) return text("No pickup awaiting waste processing confirmation.");

  await supabase
    .from("pickups")
    .update({ status: "processed" })
    .eq("id", pickup.id);

  await supabase.from("pickup_events").insert({
    pickup_id: pickup.id,
    status: "processed",
    changed_by: profileId,
    notes: "Farmer confirmed waste processed via WhatsApp",
  });

  return text("Thank you! Waste processing has been recorded.");
}

const pendingAction = new Map<string, CollectorPhotoStage>();

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
    if (buttonPayload === "picked_up" || messageBody === "picked up") {
      const pickup = await findPickupForCollectorByStatus(profile.id, "assigned");
      if (!pickup) return text("No assigned pickup found.");
      pendingAction.set(phone, "assigned");
      return text(PHOTO_PROMPT);
    }

    if (buttonPayload === "in_transit" || messageBody === "in transit") {
      const pickup = await findPickupForCollectorByStatus(profile.id, "picked_up");
      if (!pickup) {
        const alreadyInTransit = await findPickupForCollectorByStatus(
          profile.id,
          "in_transit"
        );
        if (alreadyInTransit) {
          return deliveredOnlyButtonsReply("In transit status is confirmed.");
        }
        return text("No picked-up delivery found to mark in transit.");
      }

      await markPickupInTransit(profile.id, pickup);
      return deliveredOnlyButtonsReply("In transit status is confirmed.");
    }

    if (buttonPayload === "delivered" || messageBody === "delivered") {
      const pickup = await findPickupForDelivery(profile.id);
      if (!pickup) {
        return text("No active delivery found to mark as delivered.");
      }
      pendingAction.set(phone, "delivery");
      return text(PHOTO_PROMPT);
    }

    if (hasMedia && body.MediaId) {
      const action = pendingAction.get(phone);
      if (!action) {
        const assigned = await findPickupForCollectorByStatus(profile.id, "assigned");
        if (assigned) {
          return handleCollectorPhoto(profile.id, body.MediaId, "assigned");
        }
        const delivery = await findPickupForDelivery(profile.id);
        if (delivery) {
          return handleCollectorPhoto(profile.id, body.MediaId, "delivery");
        }
        return text("No pickup found awaiting your photo.");
      }

      pendingAction.delete(phone);
      return handleCollectorPhoto(profile.id, body.MediaId, action);
    }

    const assigned = await findPickupForCollectorByStatus(profile.id, "assigned");
    if (assigned) {
      return buttons(COLLECTOR_ACTION_PROMPT, COLLECTOR_PICKED_UP_BUTTON);
    }

    const inTransit = await findPickupForCollectorByStatus(profile.id, "in_transit");
    if (inTransit) {
      return buttons(COLLECTOR_DELIVERED_PROMPT, COLLECTOR_DELIVERED_BUTTON);
    }

    const pickedUp = await findPickupForCollectorByStatus(profile.id, "picked_up");
    if (pickedUp) {
      return buttons(COLLECTOR_POST_PICKUP_PROMPT, COLLECTOR_POST_PICKUP_BUTTONS);
    }

    return buttons(COLLECTOR_ACTION_PROMPT, COLLECTOR_PICKED_UP_BUTTON);
  }

  if (profile.role === "farmer") {
    const input = normalizeFarmerWhatsAppChoice(buttonPayload || messageBody);

    if (input === "waste_processed") {
      return handleFarmerWasteProcessed(profile.id);
    }

    const deliveryChoices = [
      "1",
      "2",
      "3",
      "4",
      "received",
      "reject_mixed",
      "reject_other",
    ];
    if (deliveryChoices.includes(input)) {
      return handleFarmerResponse(profile.id, input);
    }

    return text("Please use the buttons in your latest message to respond.");
  }

  return text("Your role does not support WhatsApp interactions yet.");
}
