import { sendWhatsAppMessage, sendWhatsAppButtons } from "./client";
import type { WhatsAppHandlerReply } from "./types";

export async function dispatchHandlerReply(
  to: string,
  reply: WhatsAppHandlerReply
): Promise<void> {
  if (reply.kind === "text") {
    await sendWhatsAppMessage(to, reply.message);
    return;
  }

  await sendWhatsAppButtons(to, reply.message, reply.buttons);

  for (const followUp of reply.followUps ?? []) {
    if (followUp.kind === "text") {
      await sendWhatsAppMessage(to, followUp.message);
    } else {
      await sendWhatsAppButtons(to, followUp.message, followUp.buttons);
    }
  }
}
