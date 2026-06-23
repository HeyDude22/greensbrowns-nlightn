import { NextRequest, NextResponse } from "next/server";
import { sendBwgPickupCancelledWhatsApp } from "@/lib/whatsapp/notifications";

export async function POST(req: NextRequest) {
  try {
    const { pickupId } = (await req.json()) as { pickupId: string };
    if (!pickupId) {
      return NextResponse.json({ error: "pickupId required" }, { status: 400 });
    }

    await sendBwgPickupCancelledWhatsApp(pickupId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[notify/pickup-cancelled] Error:", error);
    return NextResponse.json(
      { error: "Failed to send notification" },
      { status: 500 },
    );
  }
}
