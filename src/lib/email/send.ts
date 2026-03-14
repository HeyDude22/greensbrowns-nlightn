import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: "GreensBrowns <info@greensbrowns.com>",
      to,
      subject,
      html,
    });

    if (error) {
      console.error(`[Email] Resend error for ${to}:`, error);
      return false;
    }

    console.log(`[Email] Sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error(`[Email] Failed to send to ${to}:`, error);
    return false;
  }
}
