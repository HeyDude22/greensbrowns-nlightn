import { createAdminClient } from "@/lib/supabase/admin";
import { transitionPickedUpToInTransit } from "@/lib/pickup-status";
import { sendWhatsAppMessage, sendWhatsAppButtons, downloadMedia } from "./client";
import {
  PHOTO_PROMPT,
  FARMER_WASTE_PROCESSED_PROMPT,
  COLLECTOR_ACTION_PROMPT,
  COLLECTOR_DELIVERED_PROMPT,
  farmerDeliveryETAMessage,
} from "./templates";
import { sendBwgDeliveryWhatsApp } from "./notifications";
import { getETA } from "@/lib/google/distance-matrix";
import type { WhatsAppHandlerReply } from "./types";
import {
  COLLECTOR_ACTION_BUTTONS,
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

type CollectorPhotoStage = "assigned" | "in_transit";

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

  await sendWhatsAppButtons(profile.phone, FARMER_WASTE_PROCESSED_PROMPT, [
    { id: "waste_processed", title: "Waste Processed" },
  ]);
}

async function handleCollectorPhoto(
  profileId: string,
  mediaId: string,
  stage: CollectorPhotoStage
): Promise<WhatsAppHandlerReply> {
  const newStatus = stage === "assigned" ? "picked_up" : "delivered";
  const photoField =
    newStatus === "picked_up" ? "photo_before_url" : "photo_after_url";

  const pickup = await findPickupForCollectorByStatus(profileId, stage);
  if (!pickup) {
    if (stage === "in_transit") {
      return text(
        "No in-transit delivery found. Wait a few minutes after pickup, then try again."
      );
    }
    return text("No pickup found awaiting your photo.");
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
    await notifyFarmerETA(pickup);
  }

  if (newStatus === "delivered" && pickup.farmer_id) {
    await notifyFarmerConfirmDelivery(pickup.farmer_id);
    await sendBwgDeliveryWhatsApp(pickup.id);
  }

  const { data: collectorProfile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", profileId)
    .single();

  if (newStatus === "picked_up" && collectorProfile?.phone) {
    await sendWhatsAppButtons(
      collectorProfile.phone,
      COLLECTOR_DELIVERED_PROMPT,
      COLLECTOR_DELIVERED_BUTTON
    );
    return text(
      "Pickup confirmed! Status will change to in transit shortly. Tap Delivered when you reach the farm."
    );
  }

  return text(
    newStatus === "picked_up"
      ? "Pickup confirmed! Status will change to in transit shortly."
      : "Delivery confirmed! Waiting for farmer to accept."
  );
}

async function notifyFarmerETA(pickup: {
  id: string;
  farmer_id: string | null;
  organization_id: string;
  vehicle_id: string | null;
  estimated_weight_kg: number | null;
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

  const message = farmerDeliveryETAMessage({
    etaMinutes: eta?.durationMinutes ?? 30,
    regNumber: vehicle?.registration_number ?? "N/A",
  });

  await sendWhatsAppMessage(farmerProfile.phone, message);
}

async function notifyFarmerConfirmDelivery(farmerId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", farmerId)
    .single();

  if (!profile?.phone) return;

  await sendWhatsAppButtons(
    profile.phone,
    "Waste has been delivered to your farm. Please confirm:",
    [
      { id: "received", title: "Received" },
      { id: "reject_mixed", title: "Reject-Mixed Waste" },
      { id: "reject_other", title: "Reject-Other" },
    ]
  );
}

async function handleFarmerResponse(
  profileId: string,
  body: string
): Promise<WhatsAppHandlerReply> {
  const pickup = await findDeliveredPickupForFarmer(profileId);
  if (!pickup) return text("No pending delivery found.");

  const choice = body.trim().toLowerCase();

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
    await transitionPickedUpToInTransit();

    if (buttonPayload === "picked_up" || messageBody === "picked up") {
      const pickup = await findPickupForCollectorByStatus(profile.id, "assigned");
      if (!pickup) return text("No assigned pickup found.");
      pendingAction.set(phone, "assigned");
      return text(PHOTO_PROMPT);
    }

    if (buttonPayload === "delivered" || messageBody === "delivered") {
      let pickup = await findPickupForCollectorByStatus(profile.id, "in_transit");
      if (!pickup) {
        await transitionPickedUpToInTransit();
        pickup = await findPickupForCollectorByStatus(profile.id, "in_transit");
      }
      if (!pickup) {
        const stillPickedUp = await findPickupForCollectorByStatus(profile.id, "picked_up");
        if (stillPickedUp) {
          return text(
            "Pickup is still in transit. Please wait a few minutes after pickup, then tap Delivered again."
          );
        }
        return text("No in-transit delivery found to mark as delivered.");
      }
      pendingAction.set(phone, "in_transit");
      return text(PHOTO_PROMPT);
    }

    if (hasMedia && body.MediaId) {
      const action = pendingAction.get(phone);
      if (!action) {
        const assigned = await findPickupForCollectorByStatus(profile.id, "assigned");
        if (assigned) {
          return handleCollectorPhoto(profile.id, body.MediaId, "assigned");
        }
        await transitionPickedUpToInTransit();
        const inTransit = await findPickupForCollectorByStatus(profile.id, "in_transit");
        if (inTransit) {
          return handleCollectorPhoto(profile.id, body.MediaId, "in_transit");
        }
        return text("No pickup found awaiting your photo.");
      }

      pendingAction.delete(phone);
      return handleCollectorPhoto(profile.id, body.MediaId, action);
    }

    return buttons(COLLECTOR_ACTION_PROMPT, COLLECTOR_ACTION_BUTTONS);
  }

  if (profile.role === "farmer") {
    const input = buttonPayload || messageBody;

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
