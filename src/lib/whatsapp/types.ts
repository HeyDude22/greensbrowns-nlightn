import type { PickupStatus } from "@/types/enums";

export type WhatsAppButton = { id: string; title: string };

export type WhatsAppHandlerReply =
  | { kind: "text"; message: string; followUps?: WhatsAppHandlerReply[] }
  | {
      kind: "buttons";
      message: string;
      buttons: WhatsAppButton[];
      followUps?: WhatsAppHandlerReply[];
    };

/** Meta template `collector_job_assigned` quick reply */
export const COLLECTOR_ACCEPT_JOB_BUTTON: WhatsAppButton[] = [
  { id: "driver_accepted", title: "Accepted" },
];

/** Meta template `collector_pickup_reminder_*` quick reply */
export const COLLECTOR_ENROUTE_BUTTON: WhatsAppButton[] = [
  { id: "enroute", title: "Enroute" },
];

/** Session button after enroute */
export const COLLECTOR_ARRIVED_BWG_BUTTON: WhatsAppButton[] = [
  { id: "arrived_bwg", title: "Arrived" },
];

export const COLLECTOR_PICKUP_LOAD_BUTTONS: WhatsAppButton[] = [
  { id: "full_pickup", title: "Full Pickup" },
  { id: "partial_pickup", title: "Partial Pickup" },
];

export const COLLECTOR_IN_TRANSIT_BUTTON: WhatsAppButton[] = [
  { id: "in_transit", title: "In Transit" },
];

/** Session button after in_transit */
export const COLLECTOR_ARRIVED_PROCESSOR_BUTTON: WhatsAppButton[] = [
  { id: "arrived_processor", title: "Arrived" },
];

/** Meta template `farmer_delivery_confirm` quick reply */
export const PROCESSOR_ACCEPT_BUTTON: WhatsAppButton[] = [
  { id: "processor_accepted", title: "Accepted" },
];

/** Meta template `bwg_pickup_requested` quick reply */
export const BWG_CANCEL_PICKUP_BUTTON: WhatsAppButton[] = [
  { id: "cancel_pickup", title: "Cancel" },
];

/** Session follow-up buttons after each collector status (not Meta templates). */
export const COLLECTOR_SESSION_NEXT: Partial<Record<PickupStatus, WhatsAppButton[]>> = {
  driver_accepted: COLLECTOR_ENROUTE_BUTTON,
  enroute: COLLECTOR_ARRIVED_BWG_BUTTON,
  arrived_bwg: COLLECTOR_PICKUP_LOAD_BUTTONS,
  full_pickup: COLLECTOR_IN_TRANSIT_BUTTON,
  partial_pickup: COLLECTOR_IN_TRANSIT_BUTTON,
  in_transit: COLLECTOR_ARRIVED_PROCESSOR_BUTTON,
};

/** @deprecated */
export const COLLECTOR_NEXT_BUTTONS = COLLECTOR_SESSION_NEXT;
export const COLLECTOR_PICKED_UP_BUTTON = COLLECTOR_ACCEPT_JOB_BUTTON;
export const COLLECTOR_POST_PICKUP_BUTTONS = COLLECTOR_IN_TRANSIT_BUTTON;
export const COLLECTOR_DELIVERED_BUTTON = COLLECTOR_ARRIVED_PROCESSOR_BUTTON;
export const COLLECTOR_ACTION_BUTTONS = COLLECTOR_ACCEPT_JOB_BUTTON;
