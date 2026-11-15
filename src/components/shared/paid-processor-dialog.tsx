"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { checkPaidOneOffProcessor, type PaidProcessorCheck } from "@/lib/paid-one-off-processor";

/** What the admin chose: keep the paid processor, go ahead with the selected one, or cancel. */
export type PaidProcessorDecision =
  | { action: "proceed" }
  | { action: "keep"; processorId: string; processorName: string }
  | { action: "cancel" };

/**
 * Ask before a job sends a paid one-off pickup to a processor other than the
 * one it was paid for. Call `confirmProcessor` before creating or confirming
 * a job and render `paidProcessorDialog` once in the component.
 */
export function usePaidProcessorDialog() {
  const [pending, setPending] = useState<
    (PaidProcessorCheck & { resolve: (d: PaidProcessorDecision) => void }) | null
  >(null);

  async function confirmProcessor(
    supabase: SupabaseClient,
    pickupIds: string[],
    farmerId: string | null | undefined,
  ): Promise<PaidProcessorDecision> {
    const check = await checkPaidOneOffProcessor(supabase, pickupIds, farmerId);
    if (!check) return { action: "proceed" };
    return new Promise((resolve) => setPending({ ...check, resolve }));
  }

  function decide(decision: PaidProcessorDecision) {
    pending?.resolve(decision);
    setPending(null);
  }

  const single = pending?.conflicts.length === 1 ? pending.conflicts[0] : null;

  const paidProcessorDialog = (
    <Dialog open={!!pending} onOpenChange={(open) => !open && decide({ action: "cancel" })}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Paid for a different processor</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1">
              {pending?.conflicts.map((c) => (
                <p key={c.processorId}>
                  {c.pickupNumbers.join(", ")} {c.pickupNumbers.length > 1 ? "were" : "was"} paid for{" "}
                  <strong>{c.processorName}</strong>.
                </p>
              ))}
              <p>
                This job uses <strong>{pending?.selectedName}</strong>.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => decide({ action: "cancel" })}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => decide({ action: "proceed" })}>
            Use {pending?.selectedName}
          </Button>
          {single && (
            <Button onClick={() => decide({ action: "keep", processorId: single.processorId, processorName: single.processorName })}>
              Keep {single.processorName}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirmProcessor, paidProcessorDialog };
}
