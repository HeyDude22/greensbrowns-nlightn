export type WhatsAppButton = { id: string; title: string };

export type WhatsAppHandlerReply =
  | { kind: "text"; message: string; followUps?: WhatsAppHandlerReply[] }
  | {
      kind: "buttons";
      message: string;
      buttons: WhatsAppButton[];
      followUps?: WhatsAppHandlerReply[];
    };

/** Shown when a pickup is assigned — collector marks pickup only. */
export const COLLECTOR_PICKED_UP_BUTTON: WhatsAppButton[] = [
  { id: "picked_up", title: "Picked Up" },
];

/** Shown after pickup photo is confirmed — collector marks in transit or delivery. */
export const COLLECTOR_POST_PICKUP_BUTTONS: WhatsAppButton[] = [
  { id: "in_transit", title: "In Transit" },
  { id: "delivered", title: "Delivered" },
];

/** Shown after in transit is confirmed — collector marks delivery only. */
export const COLLECTOR_DELIVERED_BUTTON: WhatsAppButton[] = [
  { id: "delivered", title: "Delivered" },
];

/** @deprecated Use COLLECTOR_PICKED_UP_BUTTON */
export const COLLECTOR_ACTION_BUTTONS = COLLECTOR_PICKED_UP_BUTTON;
