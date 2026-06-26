import {
  sendWhatsAppMessage,
  sendWhatsAppButtons,
  sendWhatsAppList,
} from "./client";
import type { WhatsAppHandlerReply } from "./types";

export async function dispatchHandlerReply(
  to: string,
  reply: WhatsAppHandlerReply,
): Promise<void> {
  switch (reply.kind) {
    case "none":
      return;
    case "text":
      await sendWhatsAppMessage(to, reply.message);
      break;
    case "buttons":
      await sendWhatsAppButtons(to, reply.message, reply.buttons);
      break;
    case "list":
      await sendWhatsAppList(to, reply.message, reply.button, reply.sections);
      break;
  }

  for (const followUp of reply.followUps ?? []) {
    await dispatchHandlerReply(to, followUp);
  }
}
