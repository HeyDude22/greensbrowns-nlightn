import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @deprecated Driver marks in transit explicitly via WhatsApp. Kept for cron compatibility.
 */
export async function transitionPickedUpToInTransit(): Promise<number> {
  return 0;
}
