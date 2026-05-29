"use client";

import { useEffect, useState } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { PICKUP_STATUS_LABELS, PICKUP_STATUS_COLORS } from "@/lib/constants";
import { Plus, Truck, CreditCard } from "lucide-react";
import Link from "next/link";
import type { Pickup } from "@/types";

export default function BwgPickupsPage() {
  const { user, orgId, loading: orgLoading, supabase } = useOrganization();
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orgLoading || !user) return;
    if (!orgId) {
      setLoading(false);
      return;
    }
    async function fetchPickups() {
      const { data } = await supabase
        .from("pickups")
        .select("*")
        .eq("organization_id", orgId!)
        .order("scheduled_date", { ascending: false });

      if (data) setPickups(data as Pickup[]);

      const { data: prepaidData } = await supabase
        .from("prepaid_packages")
        .select("pickup_count, used_count")
        .eq("organization_id", orgId!)
        .eq("status", "approved")
        .gt("expires_at", new Date().toISOString());

      if (prepaidData) {
        const totalCredits = prepaidData.reduce(
          (sum, pkg) => sum + (pkg.pickup_count - pkg.used_count),
          0
        );
        setCredits(totalCredits);
      }

      setLoading(false);
    }
    fetchPickups();
  }, [user, orgId, orgLoading, supabase]);

  if (orgLoading || loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pickups"
        description="Manage your waste pickups"
        action={
          <Button asChild>
            <Link href="/dashboard/bwg/pickups/new">
              <Plus className="mr-2 h-4 w-4" /> Schedule Pickup
            </Link>
          </Button>
        }
      />

      {credits > 0 ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-green-600 shrink-0" />
          <p className="text-sm text-green-800">
            You have <strong>{credits}</strong> prepaid pickup credit{credits !== 1 ? "s" : ""} remaining.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            No prepaid credits.{" "}
            <Link href="/dashboard/bwg/prepaid" className="underline font-medium">
              Buy prepaid credits
            </Link>
          </p>
        </div>
      )}

      {pickups.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Truck}
              title="No pickups yet"
              description="Schedule your first waste pickup to get started."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pickup #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Slot</TableHead>
                  <TableHead>Est. Weight (t)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pickups.map((pickup) => (
                  <TableRow key={pickup.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/bwg/pickups/${pickup.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {pickup.pickup_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {new Date(pickup.scheduled_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="capitalize">
                      {pickup.scheduled_slot || "—"}
                    </TableCell>
                    <TableCell>
                      {pickup.estimated_weight_kg
                        ? `${(Number(pickup.estimated_weight_kg) / 1000).toFixed(2)} t`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={PICKUP_STATUS_COLORS[pickup.status]}
                      >
                        {PICKUP_STATUS_LABELS[pickup.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
