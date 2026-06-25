import { NextRequest, NextResponse } from "next/server";
import { processDriverNoShowTimeouts } from "@/lib/process-driver-no-show";

// Runs after each slot deadline: 12:30 / 16:30 / 20:30 IST = 0 7 / 0 11 / 0 15 UTC.
// The processor re-checks each pickup's deadline, so extra runs are safe.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await processDriverNoShowTimeouts();
    return NextResponse.json({ ok: true, driverNoShow: count });
  } catch (error) {
    console.error("[DriverNoShow] cron error", error);
    return NextResponse.json({ error: "Failed to process timeouts" }, { status: 500 });
  }
}
