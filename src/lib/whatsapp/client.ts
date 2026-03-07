import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER!;

const client = twilio(accountSid, authToken);

function formatWhatsApp(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  const withCountry = cleaned.startsWith("91") ? cleaned : `91${cleaned}`;
  return `whatsapp:+${withCountry}`;
}

export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<string | null> {
  try {
    const message = await client.messages.create({
      from: `whatsapp:${whatsappNumber}`,
      to: formatWhatsApp(to),
      body,
    });
    console.log(`[WhatsApp] Sent to ${to}: ${message.sid}`);
    return message.sid;
  } catch (error) {
    console.error(`[WhatsApp] Failed to send to ${to}:`, error);
    return null;
  }
}

export async function sendWhatsAppTemplate(
  to: string,
  contentSid: string,
  contentVariables: Record<string, string>
): Promise<string | null> {
  try {
    const message = await client.messages.create({
      from: `whatsapp:${whatsappNumber}`,
      to: formatWhatsApp(to),
      contentSid,
      contentVariables: JSON.stringify(contentVariables),
    });
    console.log(`[WhatsApp] Template sent to ${to}: ${message.sid}`);
    return message.sid;
  } catch (error) {
    console.error(`[WhatsApp] Template failed for ${to}:`, error);
    return null;
  }
}

export async function sendWhatsAppButtons(
  to: string,
  body: string,
  buttons: { id: string; title: string }[]
): Promise<string | null> {
  try {
    const message = await client.messages.create({
      from: `whatsapp:${whatsappNumber}`,
      to: formatWhatsApp(to),
      body,
      persistentAction: buttons.map((b) => `id:${b.id},title:${b.title}`),
    });
    console.log(`[WhatsApp] Buttons sent to ${to}: ${message.sid}`);
    return message.sid;
  } catch (error) {
    console.error(`[WhatsApp] Buttons failed for ${to}:`, error);
    return null;
  }
}

export function getMediaUrl(mediaSid: string, messageSid: string): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}/Media/${mediaSid}`;
}

export { client as twilioClient };
