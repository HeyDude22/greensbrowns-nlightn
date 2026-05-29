import { createAdminClient } from "@/lib/supabase/admin";

const IN_TRANSIT_DELAY_MS = 5 * 60 * 1000;

/**
 * Move pickups from picked_up → in_transit after 5 minutes (based on latest picked_up event).
 */
export async function transitionPickedUpToInTransit(): Promise<number> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - IN_TRANSIT_DELAY_MS).toISOString();

  const { data: pickups, error } = await supabase
    .from("pickups")
    .select("id, requested_by")
    .eq("status", "picked_up");

  if (error || !pickups?.length) return 0;

  let count = 0;

  for (const pickup of pickups) {
    const { data: event } = await supabase
      .from("pickup_events")
      .select("created_at")
      .eq("pickup_id", pickup.id)
      .eq("status", "picked_up")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!event || event.created_at > cutoff) continue;

    const { error: updateError } = await supabase
      .from("pickups")
      .update({ status: "in_transit" })
      .eq("id", pickup.id)
      .eq("status", "picked_up");

    if (updateError) continue;

    await supabase.from("pickup_events").insert({
      pickup_id: pickup.id,
      status: "in_transit",
      changed_by: pickup.requested_by,
      notes: "Automatically marked in transit (5 min after pickup)",
    });

    count++;
  }

  return count;
}
