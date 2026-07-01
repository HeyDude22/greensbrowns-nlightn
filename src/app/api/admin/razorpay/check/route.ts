import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/supabase/admin";
import {
  probeRazorpayAuth,
  razorpayCredentialDiagnostics,
} from "@/lib/razorpay";

/**
 * Admin-only: verify Razorpay API credentials without exposing secrets.
 * GET /api/admin/razorpay/check
 */
export async function GET() {
  const { admin, error: authError } = await verifyAdmin();
  if (authError || !admin) {
    return NextResponse.json({ error: authError ?? "Unauthorized" }, { status: 401 });
  }

  const diagnostics = razorpayCredentialDiagnostics();
  if (!diagnostics.configured) {
    return NextResponse.json({
      ok: false,
      diagnostics,
      auth: { ok: false, error: "RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is empty" },
    });
  }

  const auth = await probeRazorpayAuth();

  return NextResponse.json({
    ok: auth.ok,
    diagnostics,
    auth,
  });
}
