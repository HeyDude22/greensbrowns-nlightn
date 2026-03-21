import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";

const SLOT_LABELS: Record<string, string> = {
  morning: "Morning (6 AM - 12 PM)",
  afternoon: "Afternoon (12 PM - 4 PM)",
  evening: "Evening (4 PM - 8 PM)",
};

function slotLabel(slot: string | null): string {
  return slot ? SLOT_LABELS[slot] || slot : "TBD";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface PickupRow {
  pickup_id: string;
  pickups: {
    pickup_number: string | null;
    estimated_weight_kg: number | null;
    scheduled_slot: string | null;
    organizations: { name: string } | null;
  } | null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Calculate tomorrow's date in IST (UTC+5:30)
  const now = new Date();
  const istOffset = 330 * 60 * 1000; // 5h30m in ms
  const istNow = new Date(now.getTime() + istOffset);
  const istTomorrow = new Date(istNow);
  istTomorrow.setUTCDate(istTomorrow.getUTCDate() + 1);
  const tomorrowStr = istTomorrow.toISOString().slice(0, 10); // YYYY-MM-DD

  // Fetch all jobs scheduled for tomorrow
  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select(
      "id, job_number, scheduled_date, status, vehicle_id, driver_id, vehicles(registration_number), drivers(name)"
    )
    .eq("scheduled_date", tomorrowStr)
    .in("status", ["draft", "pending", "dispatched", "in_progress"])
    .order("job_number");

  if (jobsError) {
    console.error("[Daily Jobs] Query error:", jobsError);
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  if (!jobs?.length) {
    console.log(`[Daily Jobs] No jobs for ${tomorrowStr}`);
    return NextResponse.json({ ok: true, emailsSent: 0, reason: "No jobs for tomorrow" });
  }

  // Fetch pickups for all jobs via job_pickups
  const jobIds = jobs.map((j) => j.id);
  const { data: jobPickups } = await supabase
    .from("job_pickups")
    .select(
      "job_id, pickup_id, pickups(pickup_number, estimated_weight_kg, scheduled_slot, organizations(name))"
    )
    .in("job_id", jobIds);

  // Group pickups by job
  const pickupsByJob = new Map<string, PickupRow[]>();
  for (const jp of (jobPickups ?? []) as unknown as (PickupRow & { job_id: string })[]) {
    const list = pickupsByJob.get(jp.job_id) ?? [];
    list.push(jp);
    pickupsByJob.set(jp.job_id, list);
  }

  // Build table rows
  const tableRows = jobs
    .map((job) => {
      const vehicle = job.vehicles as unknown as { registration_number: string } | null;
      const driver = job.drivers as unknown as { name: string } | null;
      const pickups = pickupsByJob.get(job.id) ?? [];
      const pickupCount = pickups.length;

      // Collect unique org names
      const orgNames = [
        ...new Set(
          pickups
            .map((p) => p.pickups?.organizations?.name)
            .filter(Boolean) as string[]
        ),
      ];

      // Sum estimated weights
      const totalWeight = pickups.reduce(
        (sum, p) => sum + (p.pickups?.estimated_weight_kg ?? 0),
        0
      );

      // Get slot from first pickup (jobs typically share a slot)
      const slot = pickups[0]?.pickups?.scheduled_slot ?? null;

      return `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${job.job_number}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${orgNames.join(", ") || "-"}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${vehicle?.registration_number ?? "-"}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${driver?.name ?? "-"}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${slotLabel(slot)}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${pickupCount}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${totalWeight > 0 ? `${totalWeight} kg` : "-"}</td>
        </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; background: #ffffff;">
      <div style="background: #166534; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600;">GreensBrowns</h1>
        <p style="color: #bbf7d0; margin: 6px 0 0; font-size: 14px;">Daily Job Schedule</p>
      </div>

      <div style="padding: 24px 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 15px; margin: 0 0 4px;">
          <strong>Date:</strong> ${formatDate(tomorrowStr)}
        </p>
        <p style="color: #374151; font-size: 15px; margin: 0 0 20px;">
          <strong>Total Jobs:</strong> ${jobs.length}
        </p>

        <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
          <thead>
            <tr style="background: #f0fdf4;">
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #166534; color: #166534; font-weight: 600;">Job #</th>
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #166534; color: #166534; font-weight: 600;">Organizations</th>
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #166534; color: #166534; font-weight: 600;">Vehicle</th>
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #166534; color: #166534; font-weight: 600;">Driver</th>
              <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #166534; color: #166534; font-weight: 600;">Slot</th>
              <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #166534; color: #166534; font-weight: 600;">Pickups</th>
              <th style="padding: 10px 12px; text-align: right; border-bottom: 2px solid #166534; color: #166534; font-weight: 600;">Est. Weight</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <p style="color: #6b7280; font-size: 13px; margin: 24px 0 0; border-top: 1px solid #e5e7eb; padding-top: 16px;">
          This is an automated daily summary from GreensBrowns. Please review and ensure all jobs are ready for dispatch.
        </p>
      </div>
    </div>
  `;

  // Fetch admin emails
  const { data: admins, error: adminsError } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "admin");

  if (adminsError) {
    console.error("[Daily Jobs] Admin query error:", adminsError);
    return NextResponse.json({ error: adminsError.message }, { status: 500 });
  }

  const adminEmails = (admins ?? [])
    .map((a) => a.email)
    .filter((e): e is string => !!e);

  if (!adminEmails.length) {
    console.log("[Daily Jobs] No admin emails found");
    return NextResponse.json({ ok: true, emailsSent: 0, reason: "No admin emails" });
  }

  // Send email to each admin
  let sentCount = 0;
  const subject = `Jobs for ${formatDate(tomorrowStr)} - ${jobs.length} job${jobs.length === 1 ? "" : "s"} scheduled`;

  for (const email of adminEmails) {
    const success = await sendEmail({ to: email, subject, html });
    if (success) sentCount++;
  }

  console.log(`[Daily Jobs] Sent ${sentCount}/${adminEmails.length} emails for ${tomorrowStr}`);
  return NextResponse.json({ ok: true, emailsSent: sentCount, totalJobs: jobs.length });
}
