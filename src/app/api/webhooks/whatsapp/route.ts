import { NextRequest, NextResponse } from "next/server";
import { handleIncomingMessage } from "@/lib/whatsapp/handler";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { transitionPickedUpToInTransit } from "@/lib/pickup-status";

// Meta webhook verification (GET)
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";

  if (mode === "subscribe" && token === expected) {
    console.log("[Webhook] Meta verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// Meta incoming messages (POST)
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Internal test calls bypass signature verification
  const internalSecret = req.headers.get("x-internal-secret");
  const isInternalCall = internalSecret === process.env.CRON_SECRET;

  // Extract message from Meta webhook payload
  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  // Handle status updates (delivered, read, etc.) — just acknowledge
  if (value?.statuses) {
    return NextResponse.json({ ok: true });
  }

  const message = value?.messages?.[0];
  if (!message) {
    return NextResponse.json({ ok: true });
  }

  const from = message.from; // e.g., "919060899764"
  const messageType = message.type;

  // Extract text body, button reply, or media
  let textBody = "";
  let buttonPayload = "";
  let mediaId = "";
  let mediaType = "";

  if (messageType === "text") {
    textBody = message.text?.body || "";
  } else if (messageType === "button") {
    buttonPayload = message.button?.payload || "";
    textBody = message.button?.text || "";
  } else if (messageType === "interactive") {
    const interactive = message.interactive;
    if (interactive?.type === "button_reply") {
      buttonPayload = interactive.button_reply?.id || "";
      textBody = interactive.button_reply?.title || "";
    } else if (interactive?.type === "list_reply") {
      buttonPayload = interactive.list_reply?.id || "";
      textBody = interactive.list_reply?.title || "";
    }
  } else if (messageType === "image" || messageType === "document") {
    mediaId = message[messageType]?.id || "";
    mediaType = message[messageType]?.mime_type || "";
    textBody = message[messageType]?.caption || "";
  }

  try {
    await transitionPickedUpToInTransit();

    const reply = await handleIncomingMessage({
      From: from,
      Body: textBody || buttonPayload,
      NumMedia: mediaId ? "1" : "0",
      MediaId: mediaId || undefined,
      MediaContentType0: mediaType || undefined,
      ButtonPayload: buttonPayload || undefined,
    });

    // Send reply via Meta API (not TwiML)
    await sendWhatsAppMessage(from, reply);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[WhatsApp Webhook] Error:", error);
    const userMessage =
      process.env.NODE_ENV === "production"
        ? "Something went wrong. Please try again."
        : `Error: ${error instanceof Error ? error.message : String(error)}`;

    await sendWhatsAppMessage(from, userMessage);
    return NextResponse.json({ ok: true });
  }
}
