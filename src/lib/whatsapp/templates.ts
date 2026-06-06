import { googleMapsLink } from "@/lib/google/distance-matrix";

const SLOT_LABELS: Record<string, string> = {
  morning: "Morning (6 AM - 12 PM)",
  afternoon: "Afternoon (12 PM - 4 PM)",
  evening: "Evening (4 PM - 8 PM)",
};

function slotLabel(slot: string | null): string {
  return slot ? SLOT_LABELS[slot] || slot : "TBD";
}

// --- Transporter messages ---

export function jobAssignedMessage(params: {
  orgName: string;
  address: string;
  date: string;
  slot: string | null;
  lat: number;
  lng: number;
  entryInstructions?: string | null;
}): string {
  const lines = [
    `New job assigned!`,
    ``,
    `Pickup from: ${params.orgName}`,
    `Address: ${params.address}`,
    `Date: ${params.date}`,
    `Slot: ${slotLabel(params.slot)}`,
  ];

  if (params.entryInstructions) {
    lines.push(``, `Entry Instructions: ${params.entryInstructions}`);
  }

  lines.push(``, `Location: ${googleMapsLink(params.lat, params.lng)}`);

  return lines.join("\n");
}

export function pickupReminder24hMessage(params: {
  orgName: string;
  slot: string | null;
  lat: number;
  lng: number;
}): string {
  return [
    `Reminder: Pickup tomorrow at ${params.orgName}`,
    `Slot: ${slotLabel(params.slot)}`,
    ``,
    `Location: ${googleMapsLink(params.lat, params.lng)}`,
  ].join("\n");
}

export function pickupReminder1hMessage(params: {
  orgName: string;
  slot: string | null;
  lat: number;
  lng: number;
}): string {
  return [
    `Pickup in 1 hour at ${params.orgName}`,
    `Slot: ${slotLabel(params.slot)}`,
    ``,
    `Location: ${googleMapsLink(params.lat, params.lng)}`,
  ].join("\n");
}

export const PHOTO_PROMPT = "Please send a photo to confirm.";

export const COLLECTOR_ACTION_PROMPT =
  "Tap a button to update your pickup status:";

export const COLLECTOR_POST_PICKUP_PROMPT =
  "Update your delivery status:";

export const COLLECTOR_DELIVERED_PROMPT =
  "When you reach the farm, tap Delivered:";

// --- Processor messages ---

export function farmerDeliveryIncomingMessage(params: {
  slot: string | null;
  collectorName: string;
  weightKg: number | null;
  regNumber: string;
}): string {
  const weight = params.weightKg ? `Est. ${params.weightKg}kg.` : "";
  return [
    `Delivery expected tomorrow`,
    `Slot: ${slotLabel(params.slot)}`,
    `From: ${params.collectorName}`,
    weight,
    `Vehicle: ${params.regNumber}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function farmerDeliveryETAMessage(params: {
  etaMinutes: number;
  regNumber: string;
}): string {
  return [
    `Waste picked up and heading to you.`,
    `ETA: ~${params.etaMinutes} mins`,
    `Vehicle: ${params.regNumber}`,
  ].join("\n");
}

export const FARMER_CONFIRM_DELIVERY =
  "Delivery arrived. Please confirm:\n\n1. Received\n2. Rejected (Mixed Waste)\n3. Rejected (Capacity Full)\n4. Rejected (Other Reason)\n\nReply with 1, 2, 3, or 4.";

export const FARMER_AUTO_ACCEPTED =
  "No response received. Delivery has been marked as accepted.";

export const FARMER_WASTE_PROCESSED_PROMPT =
  "Please confirm when you have finished processing the delivered waste.";

// --- BWG WhatsApp messages ---

export function bwgPickupScheduledMessage(params: {
  date: string;
  slot: string | null;
}): string {
  return [
    "GreensBrowns — Pickup scheduled",
    `Date: ${params.date}`,
    `Slot: ${slotLabel(params.slot)}`,
    "",
    "A vehicle has been assigned. You will be notified once the waste is delivered.",
  ].join("\n");
}

export function bwgDeliveryConfirmedMessage(params: {
  date: string;
  slot: string | null;
}): string {
  return [
    "GreensBrowns — Delivery confirmed",
    `Your waste from the pickup on ${params.date} (${slotLabel(params.slot)}) has been delivered to the composting facility.`,
    "",
    "Thank you for contributing to sustainable waste management!",
  ].join("\n");
}

// --- BWG email templates (legacy) ---

export function bwgPickupScheduledHtml(params: {
  date: string;
  slot: string | null;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #16a34a;">GreensBrowns - Pickup Scheduled</h2>
      <p>Your waste pickup has been scheduled:</p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 8px; font-weight: bold;">Date</td><td style="padding: 8px;">${params.date}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Time Slot</td><td style="padding: 8px;">${slotLabel(params.slot)}</td></tr>
      </table>
      <p>A vehicle has been assigned. You will be notified once the waste is delivered.</p>
      <p style="color: #6b7280; font-size: 14px;">— GreensBrowns Team</p>
    </div>
  `;
}

export function bwgDeliveryConfirmedHtml(params: {
  date: string;
  slot: string | null;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #16a34a;">GreensBrowns - Delivery Confirmed</h2>
      <p>Your waste from the pickup on <strong>${params.date}</strong> (${slotLabel(params.slot)}) has been successfully delivered to the composting facility.</p>
      <p>Thank you for contributing to sustainable waste management!</p>
      <p style="color: #6b7280; font-size: 14px;">— GreensBrowns Team</p>
    </div>
  `;
}
