export type WhatsAppButton = { id: string; title: string };

export type WhatsAppHandlerReply =
  | { kind: "text"; message: string }
  | {
      kind: "buttons";
      message: string;
      buttons: WhatsAppButton[];
      followUps?: WhatsAppHandlerReply[];
    };

export const COLLECTOR_ACTION_BUTTONS: WhatsAppButton[] = [
  { id: "picked_up", title: "Picked Up" },
  { id: "delivered", title: "Delivered" },
];

export const COLLECTOR_DELIVERED_BUTTON: WhatsAppButton[] = [
  { id: "delivered", title: "Delivered" },
];
