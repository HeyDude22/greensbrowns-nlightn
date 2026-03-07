import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { handleIncomingMessage } from "@/lib/whatsapp/handler";

const authToken = process.env.TWILIO_AUTH_TOKEN!;

function verifyTwilioSignature(req: NextRequest, body: string): boolean {
  const signature = req.headers.get("x-twilio-signature");
  if (!signature) return false;

  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp`;
  const params = Object.fromEntries(new URLSearchParams(body));

  return twilio.validateRequest(authToken, signature, url, params);
}

export async function POST(req: NextRequest) {
  const bodyText = await req.text();

  // Verify Twilio signature in production (skip for internal test calls)
  const internalSecret = req.headers.get("x-internal-secret");
  const isInternalCall = internalSecret === process.env.CRON_SECRET;

  if (process.env.NODE_ENV === "production" && !isInternalCall) {
    if (!verifyTwilioSignature(req, bodyText)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }
  }

  const params = Object.fromEntries(new URLSearchParams(bodyText));

  try {
    const reply = await handleIncomingMessage({
      From: params.From || "",
      Body: params.Body || "",
      NumMedia: params.NumMedia || "0",
      MediaUrl0: params.MediaUrl0,
      MediaContentType0: params.MediaContentType0,
      ButtonPayload: params.ButtonPayload,
    });

    // Return TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(reply)}</Message>
</Response>`;

    return new NextResponse(twiml, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("[WhatsApp Webhook] Error:", error);
    const userMessage =
      process.env.NODE_ENV === "production"
        ? "Something went wrong. Please try again."
        : `Error: ${error instanceof Error ? error.message : String(error)}`;
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(userMessage)}</Message>
</Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
