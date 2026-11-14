import { NextRequest, NextResponse } from "next/server";
import {
  sendDueDriverReminders,
  sendFarmerDeliveryIncomingReminders,
} from "@/lib/whatsapp/notifications";

/**
 * Runs every hour from 04:00 to 18:00 IST (see vercel.json).
 *
 * Driver reminders are sent whenever they are due, so each run sends what has
 * come due since the last one: first reminders (18h before the slot, 12h for
 * evening) and 1-hour reminders. The processor's delivery heads-up still goes
 * at 06:00, 12:00 and 16:00 IST for the next day's slots.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const driver = await sendDueDriverReminders();
  await sendFarmerDeliveryIncomingReminders();

  return NextResponse.json({
    ok: true,
    firstRemindersSent: driver.first,
    oneHourRemindersSent: driver.oneHour,
  });
}
