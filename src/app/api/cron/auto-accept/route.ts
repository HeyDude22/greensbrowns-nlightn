import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendTemplateFarmerAutoAccepted,
  sendTemplateFarmerWasteProcessed,
} from "@/lib/whatsapp/wa-templates";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Find all pickups in "delivered" status where farmer hasn't responded
  const { data: pickups, error } = await supabase
    .from("pickups")
    .select("id, farmer_id")
    .eq("status", "delivered")
    .is("farmer_responded_at", null);

  if (error) {
    console.error("[Auto-Accept] Query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!pickups?.length) {
    return NextResponse.json({ ok: true, autoAccepted: 0 });
  }

  let count = 0;

  for (const pickup of pickups) {
    // Update status to received
    const { error: updateError } = await supabase
      .from("pickups")
      .update({
        status: "received" as string,
        farmer_responded_at: new Date().toISOString(),
      })
      .eq("id", pickup.id);

    if (updateError) {
      console.error(`[Auto-Accept] Failed for pickup ${pickup.id}:`, updateError);
      continue;
    }

    // Create pickup event
    await supabase.from("pickup_events").insert({
      pickup_id: pickup.id,
      status: "received" as string,
      changed_by: pickup.farmer_id || "system",
      notes: "Auto-accepted at midnight (no farmer response)",
    });

    // Notify farmer
    if (pickup.farmer_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", pickup.farmer_id)
        .single();

      if (profile?.phone) {
        await sendTemplateFarmerAutoAccepted(profile.phone);
        await sendTemplateFarmerWasteProcessed(profile.phone);
      }
    }

    count++;
  }

  console.log(`[Auto-Accept] Auto-accepted ${count} deliveries`);
  return NextResponse.json({ ok: true, autoAccepted: count });
}
