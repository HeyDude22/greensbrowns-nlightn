const phoneNumberId = process.env.META_PHONE_NUMBER_ID!;
const accessToken = process.env.META_WHATSAPP_TOKEN!;
const graphUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.startsWith("91") ? cleaned : `91${cleaned}`;
}

async function metaSend(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(graphUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("[WhatsApp] Meta API error:", JSON.stringify(data));
      return null;
    }
    const messageId = data.messages?.[0]?.id ?? null;
    console.log(`[WhatsApp] Sent: ${messageId}`);
    return messageId;
  } catch (error) {
    console.error("[WhatsApp] Send failed:", error);
    return null;
  }
}

export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<string | null> {
  return metaSend({
    to: formatPhone(to),
    type: "text",
    text: { body },
  });
}

export async function sendWhatsAppButtons(
  to: string,
  body: string,
  buttons: { id: string; title: string }[]
): Promise<string | null> {
  return metaSend({
    to: formatPhone(to),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}

export async function sendWhatsAppImage(
  to: string,
  imageUrl: string,
  caption?: string
): Promise<string | null> {
  return metaSend({
    to: formatPhone(to),
    type: "image",
    image: { link: imageUrl, ...(caption ? { caption } : {}) },
  });
}

export async function downloadMedia(mediaId: string): Promise<Buffer> {
  // Step 1: Get media URL
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const metaData = await metaRes.json();
  const mediaUrl = metaData.url;

  // Step 2: Download the actual media
  const mediaRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!mediaRes.ok) throw new Error(`Media download failed: ${mediaRes.status}`);
  return Buffer.from(await mediaRes.arrayBuffer());
}
