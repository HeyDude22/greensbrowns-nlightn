import type { SupabaseClient } from "@supabase/supabase-js";

export async function createJobFromSuggestion(
  supabase: SupabaseClient,
  params: {
    scheduledDate: string;
    vehicleId: string;
    driverId: string | null;
    farmerId: string;
    pickupIds: string[];
    notes?: string | null;
    status?: "draft" | "pending";
    totalCostRs?: number | null;
    estimatedTrips?: number | null;
    estimatedDistanceKm?: number | null;
  },
): Promise<{ jobNumber: string } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { scheduledDate, vehicleId, driverId, farmerId, pickupIds, notes, status = "pending", totalCostRs, estimatedTrips, estimatedDistanceKm } = params;

  // Generate job number: JOB-YYYYMMDD-XXXX
  const dateStr = scheduledDate.replace(/-/g, "");
  const { count } = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("scheduled_date", scheduledDate);
  const seq = String((count ?? 0) + 1).padStart(4, "0");
  const jobNumber = `JOB-${dateStr}-${seq}`;

  // Create job
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      job_number: jobNumber,
      vehicle_id: vehicleId,
      driver_id: driverId,
      farmer_id: farmerId,
      scheduled_date: scheduledDate,
      status,
      notes: notes || null,
      total_cost_rs: totalCostRs ?? null,
      estimated_trips: estimatedTrips ?? null,
      estimated_distance_km: estimatedDistanceKm ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (jobErr || !job) return { error: "Failed to create job" };

  // Create job_pickups
  const { error: jpErr } = await supabase.from("job_pickups").insert(
    pickupIds.map((pid) => ({ job_id: job.id, pickup_id: pid })),
  );

  if (jpErr) return { error: "Job created but failed to link pickups" };

  // For draft jobs, skip pickup status changes and events
  if (status === "draft") {
    return { jobNumber };
  }

  // Update linked pickups: status -> assigned, vehicle_id, farmer_id
  await supabase
    .from("pickups")
    .update({ status: "assigned", vehicle_id: vehicleId, farmer_id: farmerId })
    .in("id", pickupIds);

  // Insert pickup events
  await supabase.from("pickup_events").insert(
    pickupIds.map((pid) => ({
      pickup_id: pid,
      status: "assigned",
      changed_by: user.id,
      notes: `Assigned via ${jobNumber}`,
    })),
  );

  // Send WhatsApp notifications to collector(s)
  fetch("/api/notify/job-assigned", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pickupIds }),
  }).catch(console.error);

  return { jobNumber };
}
