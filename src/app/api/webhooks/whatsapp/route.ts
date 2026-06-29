import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { handleIncomingMessage } from "@/lib/whatsapp/handler";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { dispatchHandlerReply } from "@/lib/whatsapp/replies";

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

/**
 * Verify Meta's X-Hub-Signature-256 over the RAW request body using the app
 * secret. Must hash the exact bytes Meta sent — never a re-serialized object.
 */
function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appSecret) {
    console.error("[Webhook] META_APP_SECRET not configured — rejecting");
    return false;
  }
  if (!header?.startsWith("sha256=")) return false;

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const provided = header.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

// Meta incoming messages (POST)
export async function POST(req: NextRequest) {
  // Read the raw body first — signature verification depends on exact bytes.
  const rawBody = await req.text();

  // Internal test calls (api/test/whatsapp-flow) bypass signature verification.
  const internalSecret = req.headers.get("x-internal-secret");
  const isInternalCall =
    !!process.env.CRON_SECRET && internalSecret === process.env.CRON_SECRET;

  if (!isInternalCall) {
    const signature = req.headers.get("x-hub-signature-256");
    if (!verifyMetaSignature(rawBody, signature)) {
      console.warn("[Webhook] signature verification failed — rejecting");
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.warn("[Webhook] invalid JSON body, ack");
    return NextResponse.json({ ok: true });
  }

  // Extract message from Meta webhook payload
  const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
  const changes = (entry?.changes as Array<Record<string, unknown>>)?.[0];
  const value = changes?.value as Record<string, unknown> | undefined;

  // Handle status updates (delivered, read, etc.) — just acknowledge
  if (value?.statuses) {
    const statuses = value.statuses as Array<Record<string, unknown>>;
    console.log("[Webhook] status update ack", {
      status: statuses[0]?.status,
      recipient: statuses[0]?.recipient_id,
    });
    return NextResponse.json({ ok: true });
  }

  const message = (value?.messages as Array<Record<string, unknown>>)?.[0];
  if (!message) {
    console.log("[Webhook] no message in payload, ack");
    return NextResponse.json({ ok: true });
  }

  const from = message.from as string; // e.g., "919060899764"
  const messageType = message.type as string;

  // Extract text body, button reply, media, or location
  let textBody = "";
  let buttonPayload = "";
  let mediaId = "";
  let mediaType = "";
  let latitude: number | undefined;
  let longitude: number | undefined;
  let locationAddress = "";

  if (messageType === "text") {
    textBody = (message.text as { body?: string })?.body || "";
  } else if (messageType === "button") {
    const button = message.button as { payload?: string; text?: string };
    buttonPayload = button?.payload || "";
    textBody = button?.text || "";
  } else if (messageType === "interactive") {
    const interactive = message.interactive as Record<string, unknown>;
    if (interactive?.type === "button_reply") {
      const reply = interactive.button_reply as { id?: string; title?: string };
      buttonPayload = reply?.id || "";
      textBody = reply?.title || "";
    } else if (interactive?.type === "list_reply") {
      const reply = interactive.list_reply as { id?: string; title?: string };
      buttonPayload = reply?.id || "";
      textBody = reply?.title || "";
    }
  } else if (messageType === "image" || messageType === "document") {
    const media = message[messageType] as {
      id?: string;
      mime_type?: string;
      caption?: string;
    };
    mediaId = media?.id || "";
    mediaType = media?.mime_type || "";
    textBody = media?.caption || "";
  } else if (messageType === "location") {
    const location = message.location as {
      latitude?: number;
      longitude?: number;
      name?: string;
      address?: string;
    };
    latitude = location?.latitude;
    longitude = location?.longitude;
    locationAddress = location?.address || location?.name || "";
    textBody = locationAddress;
  }

  try {
    console.log("[Webhook] incoming message", {
      from,
      type: messageType,
      hasMedia: !!mediaId,
      hasLocation: latitude != null && longitude != null,
      buttonPayload: buttonPayload || undefined,
    });

    const reply = await handleIncomingMessage({
      From: from,
      Body: textBody || buttonPayload,
      NumMedia: mediaId ? "1" : "0",
      MediaId: mediaId || undefined,
      MediaContentType0: mediaType || undefined,
      ButtonPayload: buttonPayload || undefined,
      Latitude: latitude,
      Longitude: longitude,
      LocationAddress: locationAddress || undefined,
    });

    await dispatchHandlerReply(from, reply);

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
