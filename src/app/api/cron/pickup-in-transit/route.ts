import { NextRequest, NextResponse } from "next/server";
import { transitionPickedUpToInTransit } from "@/lib/pickup-status";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const transitioned = await transitionPickedUpToInTransit();
  return NextResponse.json({ ok: true, transitioned });
}
