import type { PickupStatus } from "@/types/enums";

export type WhatsAppButton = { id: string; title: string };

export type WhatsAppHandlerReply =  | { kind: "text"; message: string; followUps?: WhatsAppHandlerReply[] }
  | {
      kind: "buttons";
      message: string;
      buttons: WhatsAppButton[];
      followUps?: WhatsAppHandlerReply[];
    };

export const COLLECTOR_ACCEPT_JOB_BUTTON: WhatsAppButton[] = [
  { id: "driver_accepted", title: "Accept Job" },
];

export const COLLECTOR_ENROUTE_BUTTON: WhatsAppButton[] = [
  { id: "enroute", title: "Enroute" },
];

export const COLLECTOR_ARRIVED_BWG_BUTTON: WhatsAppButton[] = [
  { id: "arrived_bwg", title: "Arrived at BWG" },
];

export const COLLECTOR_PICKUP_LOAD_BUTTONS: WhatsAppButton[] = [
  { id: "full_pickup", title: "Full Pickup" },
  { id: "partial_pickup", title: "Partial Pickup" },
];

export const COLLECTOR_IN_TRANSIT_BUTTON: WhatsAppButton[] = [
  { id: "in_transit", title: "In Transit" },
];

export const COLLECTOR_ARRIVED_PROCESSOR_BUTTON: WhatsAppButton[] = [
  { id: "arrived_processor", title: "Arrived at Processor" },
];

/** Next action buttons keyed by current pickup status. */
export const COLLECTOR_NEXT_BUTTONS: Partial<Record<PickupStatus, WhatsAppButton[]>> = {
  assigned: COLLECTOR_ACCEPT_JOB_BUTTON,
  driver_accepted: COLLECTOR_ENROUTE_BUTTON,
  enroute: COLLECTOR_ARRIVED_BWG_BUTTON,
  arrived_bwg: COLLECTOR_PICKUP_LOAD_BUTTONS,
  full_pickup: COLLECTOR_IN_TRANSIT_BUTTON,
  partial_pickup: COLLECTOR_IN_TRANSIT_BUTTON,
  in_transit: COLLECTOR_ARRIVED_PROCESSOR_BUTTON,
};

/** @deprecated Use COLLECTOR_ACCEPT_JOB_BUTTON */
export const COLLECTOR_PICKED_UP_BUTTON = COLLECTOR_ACCEPT_JOB_BUTTON;

/** @deprecated */
export const COLLECTOR_POST_PICKUP_BUTTONS = COLLECTOR_IN_TRANSIT_BUTTON;

/** @deprecated */
export const COLLECTOR_DELIVERED_BUTTON = COLLECTOR_ARRIVED_PROCESSOR_BUTTON;

/** @deprecated */
export const COLLECTOR_ACTION_BUTTONS = COLLECTOR_ACCEPT_JOB_BUTTON;
