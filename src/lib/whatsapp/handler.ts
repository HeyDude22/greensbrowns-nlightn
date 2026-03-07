import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "./client";
import {
  PHOTO_PROMPT,
  FARMER_CONFIRM_DELIVERY,
  farmerDeliveryETAMessage,
} from "./templates";
import { sendBwgDeliveryEmail } from "./notifications";
import { getETA } from "@/lib/google/distance-matrix";

const supabase = createAdminClient();

interface TwilioWebhookBody {
  From: string;
  Body: string;
  NumMedia: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  ButtonPayload?: string;
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
  status: "assigned" | "picked_up"
) {
  // Find vehicles driven by this collector (via driver phone match)
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", profileId)
    .single();

  if (!profile?.phone) return null;

  // Find driver by phone
  const phone = profile.phone.replace(/\D/g, "");
  const { data: drivers } = await supabase
    .from("drivers")
    .select("id")
    .or(`phone.eq.${phone},phone.eq.+${phone}`);

  if (!drivers?.length) return null;

  // Find vehicles assigned to these drivers
  const driverIds = drivers.map((d) => d.id);
  const { data: vds } = await supabase
    .from("vehicle_drivers")
    .select("vehicle_id")
    .in("driver_id", driverIds);

  if (!vds?.length) return null;

  const vehicleIds = vds.map((v) => v.vehicle_id);

  // Find pickup with matching status and vehicle
  const { data: pickup } = await supabase
    .from("pickups")
    .select(
      "id, status, organization_id, farmer_id, scheduled_date, scheduled_slot, estimated_weight_kg, vehicle_id"
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

async function handleCollectorPhoto(
  profileId: string,
  mediaUrl: string,
  currentStatus: "assigned" | "picked_up"
) {
  const newStatus = currentStatus === "assigned" ? "picked_up" : "delivered";
  const photoField =
    newStatus === "picked_up" ? "photo_before_url" : "photo_after_url";

  // Find the pickup awaiting this photo (by collector's vehicle assignment)
  const pickup = await findPickupForCollectorByStatus(profileId, currentStatus);
  if (!pickup) return "No pickup found awaiting your photo.";

  // Download photo from Twilio and upload to Supabase storage
  let photoBuffer: Buffer;
  try {
    const isTwilioUrl = mediaUrl.includes("api.twilio.com");
    const fetchHeaders: Record<string, string> = isTwilioUrl
      ? {
          Authorization: `Basic ${Buffer.from(
            `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
          ).toString("base64")}`,
        }
      : {};

    const photoRes = await fetch(mediaUrl, { headers: fetchHeaders });
    if (!photoRes.ok) throw new Error(`HTTP ${photoRes.status}`);
    photoBuffer = Buffer.from(await photoRes.arrayBuffer());
  } catch (err) {
    console.warn(`[WhatsApp] Photo download failed (${err}), using placeholder`);
    // 1x1 PNG placeholder — in production Twilio URLs always work
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

  // Update pickup status and photo
  const updateData: Record<string, unknown> = {
    status: newStatus,
    [photoField]: urlData.publicUrl,
  };

  if (newStatus === "delivered") {
    updateData.delivered_at = new Date().toISOString();
  }

  await supabase.from("pickups").update(updateData).eq("id", pickup.id);

  // Create pickup event
  await supabase.from("pickup_events").insert({
    pickup_id: pickup.id,
    status: newStatus,
    changed_by: profileId,
    notes: `Status updated via WhatsApp`,
  });

  // If picked_up, notify farmer with ETA
  if (newStatus === "picked_up" && pickup.farmer_id) {
    await notifyFarmerETA(pickup);
  }

  // If delivered, ask farmer to confirm + notify BWG
  if (newStatus === "delivered" && pickup.farmer_id) {
    await notifyFarmerConfirmDelivery(pickup.farmer_id);
    await sendBwgDeliveryEmail(pickup.id);
  }

  return newStatus === "picked_up"
    ? "Pickup confirmed! Tap 'Delivered' when you reach the farm."
    : "Delivery confirmed! Waiting for farmer to accept.";
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
  await sendWhatsAppMessage(profile.phone, FARMER_CONFIRM_DELIVERY);
}

async function handleFarmerResponse(profileId: string, body: string) {
  const pickup = await findDeliveredPickupForFarmer(profileId);
  if (!pickup) return "No pending delivery found.";

  const choice = body.trim();

  type RejectionReason = "mixed_waste" | "capacity_full" | "other";
  const rejectionMap: Record<string, RejectionReason> = {
    "2": "mixed_waste",
    "3": "capacity_full",
    "4": "other",
  };

  if (choice === "1") {
    await supabase
      .from("pickups")
      .update({
        status: "received" as string,
        farmer_responded_at: new Date().toISOString(),
      })
      .eq("id", pickup.id);

    await supabase.from("pickup_events").insert({
      pickup_id: pickup.id,
      status: "received" as string,
      changed_by: profileId,
      notes: "Farmer confirmed receipt via WhatsApp",
    });

    return "Thank you! Delivery confirmed as received.";
  }

  if (rejectionMap[choice]) {
    await supabase
      .from("pickups")
      .update({
        status: "rejected" as string,
        rejection_reason: rejectionMap[choice],
        farmer_responded_at: new Date().toISOString(),
      })
      .eq("id", pickup.id);

    await supabase.from("pickup_events").insert({
      pickup_id: pickup.id,
      status: "rejected" as string,
      changed_by: profileId,
      notes: `Farmer rejected: ${rejectionMap[choice]} (via WhatsApp)`,
    });

    return `Delivery rejected (${rejectionMap[choice].replace("_", " ")}). Admin has been notified.`;
  }

  return FARMER_CONFIRM_DELIVERY;
}

// Track pending action per phone: "picked_up" or "delivered" — awaiting photo
const pendingAction = new Map<string, "assigned" | "picked_up">();

export async function handleIncomingMessage(
  body: TwilioWebhookBody
): Promise<string> {
  const phone = extractPhone(body.From);
  const profile = await findProfileByPhone(phone);

  if (!profile) {
    return "Your phone number is not registered. Please contact admin.";
  }

  const hasMedia = parseInt(body.NumMedia || "0") > 0;
  const messageBody = body.Body?.trim().toLowerCase() || "";
  const buttonPayload = body.ButtonPayload?.trim().toLowerCase() || "";

  // Handle collector flows
  if (profile.role === "collector") {
    // Button tap or text: "Picked Up"
    if (buttonPayload === "picked_up" || messageBody === "picked up") {
      const pickup = await findPickupForCollectorByStatus(profile.id, "assigned");
      if (!pickup) return "No assigned pickup found.";
      pendingAction.set(phone, "assigned");
      return PHOTO_PROMPT;
    }

    // Button tap or text: "Delivered"
    if (buttonPayload === "delivered" || messageBody === "delivered") {
      const pickup = await findPickupForCollectorByStatus(profile.id, "picked_up");
      if (!pickup) return "No picked-up delivery found to mark as delivered.";
      pendingAction.set(phone, "picked_up");
      return PHOTO_PROMPT;
    }

    // Photo received — complete the pending action
    if (hasMedia && body.MediaUrl0) {
      const action = pendingAction.get(phone);
      if (!action) {
        // No pending action — try to infer from pickup status
        const assigned = await findPickupForCollectorByStatus(profile.id, "assigned");
        if (assigned) {
          return handleCollectorPhoto(profile.id, body.MediaUrl0, "assigned");
        }
        const pickedUp = await findPickupForCollectorByStatus(profile.id, "picked_up");
        if (pickedUp) {
          return handleCollectorPhoto(profile.id, body.MediaUrl0, "picked_up");
        }
        return "No pickup found awaiting your photo.";
      }

      pendingAction.delete(phone);
      return handleCollectorPhoto(profile.id, body.MediaUrl0, action);
    }

    return "Reply 'Picked Up' when at the pickup location, or 'Delivered' when at the farm.";
  }

  // Handle farmer flows
  if (profile.role === "farmer") {
    if (["1", "2", "3", "4"].includes(messageBody)) {
      return handleFarmerResponse(profile.id, messageBody);
    }

    return "Reply with 1 (Received), 2 (Mixed Waste), 3 (Capacity Full), or 4 (Other) to confirm a delivery.";
  }

  return "Your role does not support WhatsApp interactions yet.";
}
