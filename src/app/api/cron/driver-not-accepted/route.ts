import { NextRequest, NextResponse } from "next/server";
import { processDriverNotAcceptedTimeouts } from "@/lib/process-driver-not-accepted";

// Cron schedule in vercel.json: daily (`30 7 * * *`) for Vercel Hobby.
// On Pro, switch to hourly: `0 * * * *`.

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
