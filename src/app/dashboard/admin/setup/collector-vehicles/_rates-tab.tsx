"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatDateDDMMYYYY } from "@/lib/utils";
import { VEHICLE_TYPE_LABELS } from "@/lib/constants";
import type { VehicleTypeRate } from "@/types";

interface RatesTabProps {
  rates: VehicleTypeRate[];
  fetchRates: () => Promise<void>;
}

export function RatesTab({ rates, fetchRates }: RatesTabProps) {
  const supabase = createClient();
  const [editedRates, setEditedRates] = useState<Record<string, { base_fare_rs: string; per_km_rs: string }>>({});
  const [savingRates, setSavingRates] = useState(false);

  async function handleSaveRates() {
    const entries = Object.entries(editedRates);
    if (entries.length === 0) {
      toast.info("No changes to save");
      return;
    }

    setSavingRates(true);
    const { data: { user } } = await supabase.auth.getUser();

    let failed = 0;
    for (const [id, vals] of entries) {
      const { error } = await supabase
        .from("vehicle_type_rates")
        .update({
          base_fare_rs: Number(vals.base_fare_rs),
          per_km_rs: Number(vals.per_km_rs),
          updated_by: user?.id ?? null,
        })
        .eq("id", id);

      if (error) {
        console.error(error);
        failed++;
      }
    }

    if (failed > 0) {
      toast.error(`Failed to update ${failed} rate(s)`);
    } else {
      toast.success("Rates saved");
    }

    setEditedRates({});
    setSavingRates(false);
    fetchRates();
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle Type</TableHead>
                <TableHead>Base Fare (Rs)</TableHead>
                <TableHead>Per Km (Rs)</TableHead>
                <TableHead>Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((rate) => {
                const edited = editedRates[rate.id];
                return (
                  <TableRow key={rate.id}>
                    <TableCell className="font-medium">
                      {VEHICLE_TYPE_LABELS[rate.vehicle_type]}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        className="w-24"
                        value={edited?.base_fare_rs ?? String(rate.base_fare_rs)}
                        onChange={(e) =>
                          setEditedRates((prev) => ({
                            ...prev,
                            [rate.id]: {
                              base_fare_rs: e.target.value,
                              per_km_rs: prev[rate.id]?.per_km_rs ?? String(rate.per_km_rs),
                            },
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        className="w-24"
                        value={edited?.per_km_rs ?? String(rate.per_km_rs)}
                        onChange={(e) =>
                          setEditedRates((prev) => ({
                            ...prev,
                            [rate.id]: {
                              base_fare_rs: prev[rate.id]?.base_fare_rs ?? String(rate.base_fare_rs),
                              per_km_rs: e.target.value,
                            },
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateDDMMYYYY(rate.updated_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="flex justify-end mt-4">
        <Button
          onClick={handleSaveRates}
          disabled={savingRates || Object.keys(editedRates).length === 0}
        >
          {savingRates ? "Saving..." : "Save Rates"}
        </Button>
      </div>
    </>
  );
}
