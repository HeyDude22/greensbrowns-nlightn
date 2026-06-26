import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanupExpiredConversations } from "@/lib/whatsapp/conversation-state";

// Weekly housekeeping for the WhatsApp self-service flows: deletes expired
// `whatsapp_conversations` rows and purges any waste photos that were uploaded
// during an abandoned new-pickup flow but never attached to a pickup.
//
// Scheduled for Wednesday 00:00 IST = Tuesday 18:30 UTC ("30 18 * * 2").

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const result = await cleanupExpiredConversations(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[WhatsAppCleanup] cron error", error);
    return NextResponse.json(
      { error: "Failed to clean up WhatsApp conversations" },
      { status: 500 },
    );
  }
}
