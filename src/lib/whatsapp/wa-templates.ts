import { googleMapsLink } from "@/lib/google/distance-matrix";
import { sendWhatsAppTemplate } from "./client";

/** Approved template names in Meta WhatsApp Manager */
export const WA_TEMPLATE_NAMES = {
  farmerDeliveryIncoming: "farmer_delivery_incoming",
  farmerDeliveryEta: "farmer_delivery_eta",
  farmerDeliveryConfirm: "farmer_delivery_confirm",
  farmerAutoAccepted: "farmer_auto_accepted",
  farmerWasteProcessed: "farmer_waste_processed",
  bwgPickupScheduled: "bwg_pickup_scheduled",
  bwgDeliveryConfirmed: "bwg_delivery_confirmed",
  collectorJobAssigned: "collector_job_assigned",
  collectorPickupReminder24h: "collector_pickup_reminder_24h",
  collectorPickupReminder1h: "collector_pickup_reminder_1h",
} as const;

const SLOT_LABELS: Record<string, string> = {
  morning: "Morning (6 AM - 12 PM)",
  afternoon: "Afternoon (12 PM - 4 PM)",
  evening: "Evening (4 PM - 8 PM)",
};

export function formatWaSlot(slot: string | null): string {
  return slot ? SLOT_LABELS[slot] || slot : "TBD";
}

function formatWeightKg(weightKg: number | null): string {
  return weightKg != null && weightKg > 0 ? `${weightKg} kg` : "TBD";
}

export async function sendTemplateFarmerDeliveryIncoming(
  phone: string,
  params: {
    slot: string | null;
    collectorName: string;
    weightKg: number | null;
    regNumber: string;
  },
): Promise<string | null> {
  return sendWhatsAppTemplate(phone, WA_TEMPLATE_NAMES.farmerDeliveryIncoming, [
    formatWaSlot(params.slot),
    params.collectorName,
    formatWeightKg(params.weightKg),
    params.regNumber,
  ]);
}

export async function sendTemplateFarmerDeliveryEta(
  phone: string,
  params: { etaMinutes: number; regNumber: string },
): Promise<string | null> {
  return sendWhatsAppTemplate(phone, WA_TEMPLATE_NAMES.farmerDeliveryEta, [
    String(params.etaMinutes),
    params.regNumber,
  ]);
}

export async function sendTemplateFarmerDeliveryConfirm(
  phone: string,
): Promise<string | null> {
  return sendWhatsAppTemplate(phone, WA_TEMPLATE_NAMES.farmerDeliveryConfirm);
}

export async function sendTemplateFarmerAutoAccepted(
  phone: string,
): Promise<string | null> {
  return sendWhatsAppTemplate(phone, WA_TEMPLATE_NAMES.farmerAutoAccepted);
}

export async function sendTemplateFarmerWasteProcessed(
  phone: string,
): Promise<string | null> {
  return sendWhatsAppTemplate(phone, WA_TEMPLATE_NAMES.farmerWasteProcessed);
}

export async function sendTemplateBwgPickupScheduled(
  phone: string,
  params: { date: string; slot: string | null },
): Promise<string | null> {
  return sendWhatsAppTemplate(phone, WA_TEMPLATE_NAMES.bwgPickupScheduled, [
    params.date,
    formatWaSlot(params.slot),
  ]);
}

export async function sendTemplateBwgDeliveryConfirmed(
  phone: string,
  params: { date: string; slot: string | null },
): Promise<string | null> {
  return sendWhatsAppTemplate(phone, WA_TEMPLATE_NAMES.bwgDeliveryConfirmed, [
    params.date,
    formatWaSlot(params.slot),
  ]);
}

export async function sendTemplateCollectorJobAssigned(
  phone: string,
  params: {
    orgName: string;
    address: string;
    date: string;
    slot: string | null;
    lat: number;
    lng: number;
  },
): Promise<string | null> {
  return sendWhatsAppTemplate(phone, WA_TEMPLATE_NAMES.collectorJobAssigned, [
    params.orgName,
    params.address,
    params.date,
    formatWaSlot(params.slot),
    googleMapsLink(params.lat, params.lng),
  ]);
}

export async function sendTemplateCollectorPickupReminder(
  phone: string,
  type: "24h" | "1h",
  params: {
    orgName: string;
    slot: string | null;
    lat: number;
    lng: number;
  },
): Promise<string | null> {
  const name =
    type === "24h"
      ? WA_TEMPLATE_NAMES.collectorPickupReminder24h
      : WA_TEMPLATE_NAMES.collectorPickupReminder1h;

  return sendWhatsAppTemplate(phone, name, [
    params.orgName,
    formatWaSlot(params.slot),
    googleMapsLink(params.lat, params.lng),
  ]);
}

/** Map template quick-reply button labels to handler payload ids */
export function normalizeFarmerWhatsAppChoice(raw: string): string {
  const c = raw.trim().toLowerCase();
  const textMap: Record<string, string> = {
    received: "received",
    "reject-mixed waste": "reject_mixed",
    "reject-other": "reject_other",
    "waste processed": "waste_processed",
  };
  return textMap[c] ?? c.replace(/\s+/g, "_");
}
