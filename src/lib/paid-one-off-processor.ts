import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A paid one-off (guest) pickup was priced for the processor chosen when the
 * quote was sent (saved as pickups.farmer_id). If a job sends it to a
 * different processor, warn the admin: the guest has already paid a price
 * based on the quoted processor's distance.
 *
 * Must run BEFORE the job is created or confirmed, because assigning the job
 * overwrites pickups.farmer_id with the job's processor. Returns the warning
 * text (show it with toast.warning once the job is saved), or null.
 */
export async function getPaidOneOffProcessorWarning(
  supabase: SupabaseClient,
  pickupIds: string[],
  farmerId: string | null | undefined,
): Promise<string | null> {
  if (!pickupIds.length || !farmerId) return null;

  const { data, error } = await supabase
    .from("pickups")
    .select("pickup_number, farmer_id, payments(status)")
    .in("id", pickupIds)
    .eq("is_one_off", true)
    .not("farmer_id", "is", null)
    .neq("farmer_id", farmerId);

  if (error) {
    console.error("[paid one-off check] pickup lookup failed", error);
    return null;
  }

  const changed = (data ?? []).filter((p) => {
    const raw = p.payments as unknown as { status: string } | { status: string }[] | null;
    const payment = Array.isArray(raw) ? raw[0] : raw;
    return payment?.status === "paid";
  });
  if (!changed.length) return null;

  const processorIds = [...new Set(changed.map((p) => p.farmer_id as string))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, farmer_details(farm_name)")
    .in("id", processorIds);

  const nameOf = (id: string) => {
    const profile = (profiles ?? []).find((p) => p.id === id);
    const raw = profile?.farmer_details as unknown as
      | { farm_name: string | null }
      | { farm_name: string | null }[]
      | null;
    const details = Array.isArray(raw) ? raw[0] : raw;
    return details?.farm_name || profile?.full_name || "another processor";
  };

  const list = changed
    .map((p) => `${p.pickup_number} (quoted for ${nameOf(p.farmer_id as string)})`)
    .join(", ");

  return `Paid one-off pickup${changed.length > 1 ? "s" : ""} going to a different processor: ${list}. The guest paid a price based on the processor selected while quoting.`;
}

/** How long the warning toast stays up, so the admin has time to read it. */
export const PAID_ONE_OFF_WARNING_MS = 15000;

/** One toast id, so repeated checks replace the warning instead of stacking. */
export const PAID_ONE_OFF_TOAST_ID = "paid-one-off-processor";
