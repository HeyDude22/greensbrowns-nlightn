"use client";

import { useEffect, useState } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/shared/stat-card";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { PICKUP_STATUS_LABELS, PICKUP_STATUS_COLORS } from "@/lib/constants";
import { formatDateDDMMYYYY } from "@/lib/utils";
import { sumAvailableCredits } from "@/lib/prepaid-credits";
import { Truck, Calendar, Weight, FileText, CreditCard } from "lucide-react";
import Link from "next/link";
import type { Pickup } from "@/types";

export default function BwgDashboard() {
  const { user, orgId: memberOrgId, loading: orgLoading, supabase } = useOrganization();
  const [stats, setStats] = useState({
    active: 0,
    scheduled: 0,
    totalWeight: 0,
    complianceDocs: 0,
    prepaidCredits: 0,
  });
  const [recentPickups, setRecentPickups] = useState<Pickup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orgLoading || !user) return;
    if (!memberOrgId) {
      setLoading(false);
      return;
    }
    async function fetchData() {
      const orgId = memberOrgId!;

      // Fetch all pickups for this org
      const { data: pickups } = await supabase
        .from("pickups")
        .select("*")
        .eq("organization_id", orgId)
        .order("scheduled_date", { ascending: false });

      if (pickups) {
        const active = pickups.filter(
          (p) => !["processed", "cancelled"].includes(p.status)
        ).length;
        const scheduled = pickups.filter((p) => p.status === "requested").length;
        const totalWeight = pickups.reduce(
          (sum, p) => sum + (Number(p.actual_weight_kg) || Number(p.estimated_weight_kg) || 0),
          0
        );
        setStats({ active, scheduled, totalWeight, complianceDocs: 0, prepaidCredits: 0 });
        setRecentPickups((pickups as Pickup[]).slice(0, 5));
      }

      // Compliance docs count
      const { count } = await supabase
        .from("compliance_docs")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId);
      if (count) setStats((s) => ({ ...s, complianceDocs: count }));

      // Fetch prepaid credits
      const { data: prepaidData } = await supabase
        .from("prepaid_packages")
        .select("pickup_count, used_count, status, expires_at")
        .eq("organization_id", orgId)
        .eq("status", "approved")
        .gt("expires_at", new Date().toISOString());

      if (prepaidData) {
        setStats((s) => ({
          ...s,
          prepaidCredits: sumAvailableCredits(prepaidData),
        }));
      }

      setLoading(false);
    }
    fetchData();
  }, [user, memberOrgId, orgLoading, supabase]);

  if (orgLoading || loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">BWG Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Pickups" value={stats.active} icon={Truck} />
        <StatCard title="Scheduled" value={stats.scheduled} icon={Calendar} />
        <StatCard
          title="Total Weight (tonnes)"
          value={(stats.totalWeight / 1000).toFixed(2)}
          icon={Weight}
        />
        <StatCard
          title="Compliance Docs"
          value={stats.complianceDocs}
          icon={FileText}
        />
        <StatCard
          title="Prepaid Credits"
          value={stats.prepaidCredits}
          icon={CreditCard}
        />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Pickups</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/bwg/pickups">View All</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentPickups.length === 0 ? (
            <p className="text-muted-foreground">
              No pickups yet. Schedule your first pickup to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {recentPickups.map((pickup) => (
                <Link
                  key={pickup.id}
                  href={`/dashboard/bwg/pickups/${pickup.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{pickup.pickup_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateDDMMYYYY(pickup.scheduled_date)}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={PICKUP_STATUS_COLORS[pickup.status]}
                  >
                    {PICKUP_STATUS_LABELS[pickup.status]}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
