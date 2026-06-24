/**
 * Approved Meta WhatsApp template names and send helpers.
 *
 * Existing template variable numbers are unchanged; Job ID, BWG name, and
 * pickup date are appended at the bottom of each body (omitted when already present).
 *
 * See META_TEMPLATES.md in this folder for suggested template copy.
 */
import { googleMapsLink } from "@/lib/google/distance-matrix";
import { sendWhatsAppTemplate } from "./client";
import {
  type PickupWhatsAppContext,
  appendWaContext,
} from "./pickup-context";

export const WA_TEMPLATE_NAMES = {
  farmerDeliveryIncoming: "farmer_delivery_incoming",
  farmerDeliveryEta: "farmer_delivery_eta",
  farmerDeliveryConfirm: "farmer_delivery_confirm",
  farmerAutoAccepted: "farmer_auto_accepted",
  bwgPickupScheduled: "bwg_pickup_scheduled",
  bwgPickupRequested: "bwg_pickup_requested",
  bwgPickupCancelled: "bwg_pickup_cancelled_",
  bwgPickupCollected: "bwg_pickup_collected",
  bwgPickupPartial: "bwg_pickup_partial",
  bwgDeliveryConfirmed: "bwg_delivery_confirmed",
  collectorJobAssigned: "collector_job_assigned",
  collectorPickupReminder24h: "collector_pickup_reminder_24h",
  collectorPickupReminder1h: "collector_pickup_reminder_1h",
  adminDriverNotAccepted: "admin_driver_not_accepted",
  adminVehicleBreakdown: "admin_vehicle_breakdown",
  adminPickupPartial: "admin_pickup_partial",
  bwgVehicleBreakdown: "bwg_vehicle_breakdown",
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
  ctx: PickupWhatsAppContext,
  params: {
    slot: string | null;
    collectorName: string;
    weightKg: number | null;
    regNumber: string;
  },
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.farmerDeliveryIncoming,
    appendWaContext(ctx, [
      formatWaSlot(params.slot),
      params.collectorName,
      formatWeightKg(params.weightKg),
      params.regNumber,
    ]),
  );
}

export async function sendTemplateFarmerDeliveryEta(
  phone: string,
  ctx: PickupWhatsAppContext,
  params: { etaMinutes: number; regNumber: string },
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.farmerDeliveryEta,
    appendWaContext(ctx, [
      String(params.etaMinutes),
      params.regNumber,
    ]),
  );
}

export async function sendTemplateFarmerDeliveryConfirm(
  phone: string,
  ctx: PickupWhatsAppContext,
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.farmerDeliveryConfirm,
    appendWaContext(ctx, []),
  );
}

export async function sendTemplateFarmerAutoAccepted(
  phone: string,
  ctx: PickupWhatsAppContext,
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.farmerAutoAccepted,
    appendWaContext(ctx, []),
  );
}

export async function sendTemplateBwgPickupScheduled(
  phone: string,
  ctx: PickupWhatsAppContext,
  params: { slot: string | null },
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.bwgPickupScheduled,
    appendWaContext(
      ctx,
      [ctx.pickupDate, formatWaSlot(params.slot)],
      { skipDate: true },
    ),
  );
}

export async function sendTemplateBwgPickupRequested(
  phone: string,
  params: {
    pickupNumber: string;
    orgName: string;
    date: string;
    slot: string | null;
  },
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.bwgPickupRequested,
    [
      params.pickupNumber,
      params.orgName,
      params.date,
      formatWaSlot(params.slot),
    ],
  );
}

export async function sendTemplateBwgPickupCancelled(
  phone: string,
  params: {
    pickupNumber: string;
    date: string;
    slot: string | null;
  },
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.bwgPickupCancelled,
    [
      params.pickupNumber,
      params.date,
      formatWaSlot(params.slot),
    ],
  );
}

export async function sendTemplateBwgPickupCollected(
  phone: string,
  ctx: PickupWhatsAppContext,
  params: { slot: string | null },
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.bwgPickupCollected,
    appendWaContext(
      ctx,
      [ctx.pickupDate, formatWaSlot(params.slot)],
      { skipDate: true },
    ),
  );
}

export async function sendTemplateBwgPickupPartial(
  phone: string,
  ctx: PickupWhatsAppContext,
  params: { pickupNumber: string; slot: string | null },
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.bwgPickupPartial,
    appendWaContext(
      ctx,
      [params.pickupNumber, ctx.pickupDate, formatWaSlot(params.slot)],
      { skipDate: true },
    ),
  );
}

export async function sendTemplateBwgDeliveryConfirmed(
  phone: string,
  ctx: PickupWhatsAppContext,
  params: { slot: string | null },
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.bwgDeliveryConfirmed,
    appendWaContext(
      ctx,
      [ctx.pickupDate, formatWaSlot(params.slot)],
      { skipDate: true },
    ),
  );
}

export async function sendTemplateCollectorJobAssigned(
  phone: string,
  ctx: PickupWhatsAppContext,
  params: {
    orgName: string;
    address: string;
    date: string;
    slot: string | null;
    lat: number;
    lng: number;
  },
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.collectorJobAssigned,
    appendWaContext(
      ctx,
      [
        params.orgName,
        params.address,
        params.date,
        formatWaSlot(params.slot),
        googleMapsLink(params.lat, params.lng),
      ],
      { skipDate: true, skipBwg: true },
    ),
  );
}

export async function sendTemplateCollectorPickupReminder(
  phone: string,
  type: "24h" | "1h",
  ctx: PickupWhatsAppContext,
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

  return sendWhatsAppTemplate(
    phone,
    name,
    appendWaContext(
      ctx,
      [
        params.orgName,
        formatWaSlot(params.slot),
        googleMapsLink(params.lat, params.lng),
      ],
      { skipBwg: true },
    ),
  );
}

export async function sendTemplateAdminDriverNotAccepted(
  phone: string,
  ctx: PickupWhatsAppContext,
  params: {
    orgName: string;
    regNumber: string;
  },
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.adminDriverNotAccepted,
    appendWaContext(
      ctx,
      [params.orgName, ctx.pickupDate, params.regNumber],
      { skipDate: true, skipBwg: true },
    ),
  );
}

export async function sendTemplateAdminVehicleBreakdown(
  phone: string,
  ctx: PickupWhatsAppContext,
  params: {
    orgName: string;
    regNumber: string;
  },
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.adminVehicleBreakdown,
    appendWaContext(
      ctx,
      [params.orgName, ctx.pickupDate, params.regNumber],
      { skipDate: true, skipBwg: true },
    ),
  );
}

export async function sendTemplateBwgVehicleBreakdown(
  phone: string,
  ctx: PickupWhatsAppContext,
  params: {
    pickupNumber: string;
    slot: string | null;
    regNumber: string;
  },
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.bwgVehicleBreakdown,
    appendWaContext(
      ctx,
      [params.pickupNumber, ctx.pickupDate, formatWaSlot(params.slot), params.regNumber],
      { skipDate: true, skipBwg: true },
    ),
  );
}

export async function sendTemplateAdminPickupPartial(
  phone: string,
  ctx: PickupWhatsAppContext,
  params: { pickupNumber: string; orgName: string },
): Promise<string | null> {
  return sendWhatsAppTemplate(
    phone,
    WA_TEMPLATE_NAMES.adminPickupPartial,
    appendWaContext(
      ctx,
      [params.pickupNumber, params.orgName, ctx.pickupDate],
      { skipDate: true, skipBwg: true },
    ),
  );
}

/** Map BWG template quick-reply button labels to handler payload ids */
export function normalizeBwgWhatsAppChoice(raw: string): string {
  const c = raw.trim().toLowerCase();
  const textMap: Record<string, string> = {
    cancel: "cancel_pickup",
    cancel_pickup: "cancel_pickup",
  };
  return textMap[c] ?? c.replace(/\s+/g, "_");
}

/** Map template quick-reply button labels to handler payload ids */
export function normalizeFarmerWhatsAppChoice(raw: string): string {
  const c = raw.trim().toLowerCase();
  const textMap: Record<string, string> = {
    received: "processor_accepted",
    accepted: "processor_accepted",
    accept: "processor_accepted",
    processor_accepted: "processor_accepted",
    "1": "processor_accepted",
  };
  return textMap[c] ?? c.replace(/\s+/g, "_");
}

export function normalizeCollectorWhatsAppChoice(raw: string): string {
  const c = raw.trim().toLowerCase();
  const textMap: Record<string, string> = {
    accepted: "driver_accepted",
    driver_accepted: "driver_accepted",
    enroute: "enroute",
    arrived: "arrived_bwg",
    arrived_bwg: "arrived_bwg",
    arrived_processor: "arrived_processor",
    full_pickup: "full_pickup",
    "full pickup": "full_pickup",
    partial_pickup: "partial_pickup",
    "partial pickup": "partial_pickup",
    in_transit: "in_transit",
    "in transit": "in_transit",
    breakdown: "breakdown",
  };
  return textMap[c] ?? c.replace(/\s+/g, "_");
}
