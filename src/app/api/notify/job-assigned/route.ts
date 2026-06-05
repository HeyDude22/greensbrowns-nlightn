import { NextRequest, NextResponse } from "next/server";
import { sendJobAssignedNotification, sendBwgPickupWhatsApp } from "@/lib/whatsapp/notifications";

export async function POST(req: NextRequest) {
  try {
    const { pickupIds } = (await req.json()) as { pickupIds: string[] };
    if (!pickupIds?.length) {
      return NextResponse.json({ error: "pickupIds required" }, { status: 400 });
    }

    await Promise.all(
      pickupIds.flatMap((id) => [
        sendJobAssignedNotification(id),
        sendBwgPickupWhatsApp(id),
      ])
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[notify/job-assigned] Error:", error);
    return NextResponse.json({ error: "Failed to send notifications" }, { status: 500 });
  }
}
