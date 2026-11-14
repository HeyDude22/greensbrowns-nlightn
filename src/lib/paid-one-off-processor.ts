import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A paid one-off (guest) pickup was priced for the processor chosen when the
 * quote was sent (saved as pickups.farmer_id). Before a job sends it to a
 * different processor, the admin is asked whether to keep the paid one.
 *
 * Must run BEFORE the job is created or confirmed, because assigning the job
 * overwrites pickups.farmer_id with the job's processor.
 */
export interface PaidProcessorCheck {
  /** Name of the processor the job would use. */
  selectedName: string;
  /** One entry per processor the paid pickups were quoted for. */
  conflicts: { processorId: string; processorName: string; pickupNumbers: string[] }[];
}

async function processorNames(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, farmer_details(farm_name)")
    .in("id", ids);
  const names = new Map<string, string>();
  for (const p of data ?? []) {
    const raw = p.farmer_details as unknown as
      | { farm_name: string | null }
      | { farm_name: string | null }[]
      | null;
    const details = Array.isArray(raw) ? raw[0] : raw;
    names.set(p.id as string, details?.farm_name || (p.full_name as string | null) || "Processor");
  }
  return names;
}

/** Paid one-off pickups in this job that were quoted for a different processor, or null if none. */
export async function checkPaidOneOffProcessor(
  supabase: SupabaseClient,
  pickupIds: string[],
  farmerId: string | null | undefined,
): Promise<PaidProcessorCheck | null> {
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

  const paid = (data ?? []).filter((p) => {
    const raw = p.payments as unknown as { status: string } | { status: string }[] | null;
    const payment = Array.isArray(raw) ? raw[0] : raw;
    return payment?.status === "paid";
  });
  if (!paid.length) return null;

  const byProcessor = new Map<string, string[]>();
  for (const p of paid) {
    const id = p.farmer_id as string;
    byProcessor.set(id, [...(byProcessor.get(id) ?? []), p.pickup_number as string]);
  }

  const names = await processorNames(supabase, [...byProcessor.keys(), farmerId]);
  return {
    selectedName: names.get(farmerId) ?? "the selected processor",
    conflicts: [...byProcessor.entries()].map(([processorId, pickupNumbers]) => ({
      processorId,
      processorName: names.get(processorId) ?? "Processor",
      pickupNumbers,
    })),
  };
}
