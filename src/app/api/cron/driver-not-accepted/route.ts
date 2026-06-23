import { NextRequest, NextResponse } from "next/server";
import { processDriverNotAcceptedTimeouts } from "@/lib/process-driver-not-accepted";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await processDriverNotAcceptedTimeouts();
    return NextResponse.json({ ok: true, driverNotAccepted: count });
  } catch (error) {
    console.error("[DriverNotAccepted] cron error", error);
    return NextResponse.json({ error: "Failed to process timeouts" }, { status: 500 });
  }
}
