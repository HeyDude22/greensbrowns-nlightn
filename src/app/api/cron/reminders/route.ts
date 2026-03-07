import { NextRequest, NextResponse } from "next/server";
import { sendPickupReminders } from "@/lib/whatsapp/notifications";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // IST hour calculation
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = utcMinutes + 330; // +5:30
  const istHour = Math.floor((istMinutes % 1440) / 60);

  // Determine reminder type based on IST hour
  // 5 AM, 11 AM, 3 PM = 1h reminders (1h before 6, 12, 16)
  // 6 AM, 12 PM, 4 PM = 24h reminders (24h before next day's slot)
  const oneHourSlots = [5, 11, 15];
  const twentyFourHourSlots = [6, 12, 16];

  const results: string[] = [];

  if (oneHourSlots.includes(istHour)) {
    await sendPickupReminders("1h");
    results.push(`1h reminder sent (IST hour: ${istHour})`);
  }

  if (twentyFourHourSlots.includes(istHour)) {
    await sendPickupReminders("24h");
    results.push(`24h reminder sent (IST hour: ${istHour})`);
  }

  if (!results.length) {
    results.push(`No reminders due (IST hour: ${istHour})`);
  }

  return NextResponse.json({ ok: true, results });
}
