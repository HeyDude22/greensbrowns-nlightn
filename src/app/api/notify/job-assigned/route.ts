import { NextRequest, NextResponse } from "next/server";
import {
  sendJobAssignedNotification,
  sendBwgPickupWhatsApp,
  resetDriverReminders,
  sendDueDriverReminders,
} from "@/lib/whatsapp/notifications";

export async function POST(req: NextRequest) {
  try {
    const { pickupIds, skipBwg } = (await req.json()) as {
      pickupIds: string[];
      skipBwg?: boolean;
    };
    if (!pickupIds?.length) {
      return NextResponse.json({ error: "pickupIds required" }, { status: 400 });
    }

    // A (re)assigned pickup starts its reminders afresh for the new driver.
    await resetDriverReminders(pickupIds);

    await Promise.all(
      pickupIds.flatMap((id) => [
        sendJobAssignedNotification(id),
        ...(skipBwg ? [] : [sendBwgPickupWhatsApp(id)]),
      ]),
    );

    // Urgent jobs: a reminder that is already due goes straight after the job
    // assigned message (first reminder inside 18h/12h, 1h reminder inside 1h).
    await sendDueDriverReminders({ pickupIds });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[notify/job-assigned] Error:", error);
    return NextResponse.json({ error: "Failed to send notifications" }, { status: 500 });
  }
}
