import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateDDMMYYYY } from "@/lib/utils";

export interface PickupWhatsAppContext {
  jobNumber: string;
  bwgName: string;
  pickupDate: string;
}

export type WaContextSuffixOptions = {
  /** Omit pickup date when the template body already includes a date variable */
  skipDate?: boolean;
  /** Omit BWG name when the template body already includes org/BWG name */
  skipBwg?: boolean;
};

/**
 * Keep existing Meta template variable order, then append Job ID, BWG name,
 * and pickup date at the bottom (skipping fields already in the template).
 */
export function appendWaContext(
  ctx: PickupWhatsAppContext,
  existing: string[],
  options: WaContextSuffixOptions = {},
): string[] {
  const suffix: string[] = [ctx.jobNumber];
  if (!options.skipBwg) suffix.push(ctx.bwgName);
  if (!options.skipDate) suffix.push(ctx.pickupDate);
  return [...existing, ...suffix];
}

export async function getPickupWhatsAppContext(
  supabase: SupabaseClient,
  pickupId: string
): Promise<PickupWhatsAppContext | null> {
  const { data } = await supabase
    .from("pickups")
    .select(
      "pickup_number, scheduled_date, organizations(name), job_pickups(jobs(job_number))"
    )
    .eq("id", pickupId)
    .single();

  if (!data) return null;

  const jobLinks = data.job_pickups as unknown as
    | { jobs: { job_number: string } | null }[]
    | null;
  const jobNumber =
    jobLinks?.[0]?.jobs?.job_number ?? data.pickup_number ?? "—";
  const bwgName =
    (data.organizations as unknown as { name: string } | null)?.name ?? "—";

  return {
    jobNumber,
    bwgName,
    pickupDate: formatDateDDMMYYYY(data.scheduled_date),
  };
}
