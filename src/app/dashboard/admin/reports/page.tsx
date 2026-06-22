"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { PageHeader } from "@/components/shared/page-header";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PICKUP_STATUS_LABELS, PICKUP_STATUS_COLORS } from "@/lib/constants";
import { PICKUP_PIPELINE_ORDER, normalizePickupStatus } from "@/lib/pickup-status-flow";
import { BarChart3, Truck, Weight, Recycle } from "lucide-react";
import type { PickupStatus } from "@/types";

interface OrgSummary {
  name: string;
  totalPickups: number;
  totalWeight: number;
}

export default function AdminReportsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [totalPickups, setTotalPickups] = useState(0);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalWeight, setTotalWeight] = useState(0);
  const [completionRate, setCompletionRate] = useState(0);
  const [orgSummaries, setOrgSummaries] = useState<OrgSummary[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchData() {
      const { data: pickups } = await supabase
        .from("pickups")
        .select("id, status, actual_weight_kg, estimated_weight_kg, organization_id, organizations(name)")
        .order("created_at", { ascending: false });

      if (!pickups) {
        setLoading(false);
        return;
      }

      const total = pickups.length;
      const processed = pickups.filter((p) => p.status === "processed").length;
      const weight = pickups.reduce(
        (sum, p) => sum + (Number(p.actual_weight_kg) || Number(p.estimated_weight_kg) || 0),
        0
      );
      const rate = total > 0 ? Math.round((processed / total) * 100) : 0;

      setTotalPickups(total);
      setTotalProcessed(processed);
      setTotalWeight(Math.round(weight));
      setCompletionRate(rate);

      // Status counts
      const counts: Record<string, number> = {};
      for (const p of pickups) {
        const key = normalizePickupStatus(p.status);
        counts[key] = (counts[key] || 0) + 1;
      }
      setStatusCounts(counts);

      // Org summaries
      const orgMap = new Map<string, OrgSummary>();
      for (const p of pickups) {
        const orgName = (p.organizations as unknown as { name: string })?.name || "Unknown";
        const existing = orgMap.get(orgName) || { name: orgName, totalPickups: 0, totalWeight: 0 };
        existing.totalPickups++;
        existing.totalWeight += Number(p.actual_weight_kg) || Number(p.estimated_weight_kg) || 0;
        orgMap.set(orgName, existing);
      }
      setOrgSummaries(
        Array.from(orgMap.values()).sort((a, b) => b.totalPickups - a.totalPickups)
      );

      setLoading(false);
    }
    fetchData();
  }, [supabase]);

  if (loading) return <DashboardSkeleton />;

  const statuses: PickupStatus[] = [
    ...PICKUP_PIPELINE_ORDER.filter((s) => s !== "rejected"),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Platform analytics and compliance overview"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Pickups" value={totalPickups} icon={Truck} />
        <StatCard title="Processed" value={totalProcessed} icon={Recycle} />
        <StatCard title="Total Weight (kg)" value={totalWeight} icon={Weight} />
        <StatCard
          title="Completion Rate"
          value={`${completionRate}%`}
          icon={BarChart3}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pickups by Organization</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {orgSummaries.length === 0 ? (
              <p className="p-6 text-muted-foreground">No data yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Pickups</TableHead>
                    <TableHead>Weight (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgSummaries.map((org) => (
                    <TableRow key={org.name}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell>{org.totalPickups}</TableCell>
                      <TableCell>{Math.round(org.totalWeight)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {statuses.map((status) => (
                <div key={status} className="flex items-center justify-between">
                  <Badge
                    variant="secondary"
                    className={PICKUP_STATUS_COLORS[status]}
                  >
                    {PICKUP_STATUS_LABELS[status]}
                  </Badge>
                  <span className="font-medium">{statusCounts[status] || 0}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
