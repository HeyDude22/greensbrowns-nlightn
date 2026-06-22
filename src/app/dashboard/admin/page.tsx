"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { AlertCard } from "@/components/shared/alert-card";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { useRealtime } from "@/hooks/use-realtime";
import {
  PICKUP_STATUS_LABELS,
  PICKUP_STATUS_COLORS,
} from "@/lib/constants";
import { formatDateDDMMYYYY } from "@/lib/utils";
import {
  Users,
  Truck,
  Building2,
  BarChart3,
  AlertTriangle,
  ShieldCheck,
  CreditCard,
  PackageCheck,
  Factory,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import type { PickupStatus } from "@/types";
import {
  PICKUP_PIPELINE_ORDER,
  PICKUP_TERMINAL_STATUSES,
  normalizePickupStatus,
} from "@/lib/pickup-status-flow";

const PIPELINE_STATUSES: PickupStatus[] = PICKUP_PIPELINE_ORDER.filter(
  (s) => !PICKUP_TERMINAL_STATUSES.includes(s) && s !== "rejected"
);

interface RecentPickup {
  id: string;
  pickup_number: string | null;
  status: PickupStatus;
  scheduled_date: string;
  organizations: { name: string } | null;
}

interface Alerts {
  unassignedPickups: number;
  kycPending: number;
  prepaidPending: number;
  awaitingDelivery: number;
  awaitingProcessing: number;
}

interface Stats {
  totalUsers: number;
  activePickups: number;
  organizations: number;
  monthlyPickups: number;
}

export default function AdminDashboard() {
  const supabase = createClient();
  const [alerts, setAlerts] = useState<Alerts>({
    unassignedPickups: 0,
    kycPending: 0,
    prepaidPending: 0,
    awaitingDelivery: 0,
    awaitingProcessing: 0,
  });
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    activePickups: 0,
    organizations: 0,
    monthlyPickups: 0,
  });
  const [pipeline, setPipeline] = useState<Record<string, number>>({});
  const [recentPickups, setRecentPickups] = useState<RecentPickup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      // Alert counts
      { count: unassignedCount },
      { count: kycCount },
      { count: prepaidCount },
      { count: awaitingProcessorCount },
      { count: awaitingProcessingCount },
      // Overview stats
      { count: userCount },
      { count: activeCount },
      { count: orgCount },
      { count: monthlyCount },
      // Pipeline — single fetch, count client-side
      { data: pipelinePickups },
      // Recent pickups
      { data: pickups },
    ] = await Promise.all([
      // Alerts
      supabase
        .from("pickups")
        .select("*", { count: "exact", head: true })
        .eq("status", "verified"),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("kyc_status", "submitted"),
      supabase
        .from("prepaid_packages")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("pickups")
        .select("*", { count: "exact", head: true })
        .eq("status", "in_transit"),
      supabase
        .from("pickups")
        .select("*", { count: "exact", head: true })
        .eq("status", "accepted"),
      // Stats
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("pickups")
        .select("*", { count: "exact", head: true })
        .not("status", "in", '("processed","cancelled")'),
      supabase
        .from("organizations")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("pickups")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startOfMonth.toISOString()),
      // Pipeline
      supabase
        .from("pickups")
        .select("status"),
      // Recent pickups
      supabase
        .from("pickups")
        .select("id, pickup_number, status, scheduled_date, organizations(name)")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    setAlerts({
      unassignedPickups: unassignedCount || 0,
      kycPending: kycCount || 0,
      prepaidPending: prepaidCount || 0,
      awaitingDelivery: awaitingProcessorCount || 0,
      awaitingProcessing: awaitingProcessingCount || 0,
    });

    setStats({
      totalUsers: userCount || 0,
      activePickups: activeCount || 0,
      organizations: orgCount || 0,
      monthlyPickups: monthlyCount || 0,
    });

    const pipelineCounts: Record<string, number> = {};
    for (const status of PIPELINE_STATUSES) {
      pipelineCounts[status] = 0;
    }
    for (const row of pipelinePickups ?? []) {
      const key = normalizePickupStatus(row.status);
      if (key in pipelineCounts) {
        pipelineCounts[key]++;
      }
    }
    setPipeline(pipelineCounts);

    if (pickups) setRecentPickups(pickups as unknown as RecentPickup[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscriptions
  useRealtime({
    table: "pickups",
    channelName: "admin-dash-pickups",
    onData: () => fetchData(),
  });
  useRealtime({
    table: "profiles",
    channelName: "admin-dash-profiles",
    onData: () => fetchData(),
  });
  useRealtime({
    table: "prepaid_packages",
    channelName: "admin-dash-prepaid",
    onData: () => fetchData(),
  });

  if (loading) return <DashboardSkeleton />;

  const hasAlerts =
    alerts.unassignedPickups > 0 ||
    alerts.kycPending > 0 ||
    alerts.prepaidPending > 0 ||
    alerts.awaitingDelivery > 0 ||
    alerts.awaitingProcessing > 0;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {/* Action Required */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Action Required
        </h2>
        {hasAlerts ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.unassignedPickups > 0 && (
              <AlertCard
                title="Verified — Awaiting Assignment"
                count={alerts.unassignedPickups}
                icon={AlertTriangle}
                href="/dashboard/admin/jobs"
                severity="critical"
              />
            )}
            {alerts.kycPending > 0 && (
              <AlertCard
                title="KYC Reviews Pending"
                count={alerts.kycPending}
                icon={ShieldCheck}
                href="/dashboard/admin/users"
                severity="warning"
              />
            )}
            {alerts.prepaidPending > 0 && (
              <AlertCard
                title="Prepaid Approvals"
                count={alerts.prepaidPending}
                icon={CreditCard}
                href="/dashboard/admin/organizations"
                severity="warning"
              />
            )}
            {alerts.awaitingDelivery > 0 && (
              <AlertCard
                title="In Transit to Processor"
                count={alerts.awaitingDelivery}
                icon={PackageCheck}
                href="/dashboard/admin/pickups"
                severity="info"
              />
            )}
            {alerts.awaitingProcessing > 0 && (
              <AlertCard
                title="Awaiting Processing"
                count={alerts.awaitingProcessing}
                icon={Factory}
                href="/dashboard/admin/pickups"
                severity="info"
              />
            )}
          </div>
        ) : (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="text-sm font-medium text-green-800">
                All caught up — no pending actions.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Overview Stats */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Overview
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Users"
            value={stats.totalUsers}
            icon={Users}
            href="/dashboard/admin/users"
          />
          <StatCard
            title="Active Pickups"
            value={stats.activePickups}
            icon={Truck}
            href="/dashboard/admin/pickups"
          />
          <StatCard
            title="Organizations"
            value={stats.organizations}
            icon={Building2}
            href="/dashboard/admin/organizations"
          />
          <StatCard
            title="Monthly Pickups"
            value={stats.monthlyPickups}
            icon={BarChart3}
            href="/dashboard/admin/reports"
          />
        </div>
      </section>

      {/* Pickup Pipeline */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Pickup Pipeline
        </h2>
        <Card>
          <CardContent className="py-5 px-6">
            <div className="flex items-center gap-1 overflow-x-auto">
              {PIPELINE_STATUSES.map((status, i) => {
                const count = pipeline[status] ?? 0;
                const total = Object.values(pipeline).reduce((a, b) => a + b, 0) || 1;
                const pct = Math.max(count / total * 100, 8);
                return (
                  <div key={status} className="flex items-center gap-1 flex-1">
                    <Link
                      href={`/dashboard/admin/pickups?status=${status}`}
                      className="flex flex-col items-center gap-1.5 flex-1 min-w-[70px] rounded-md p-2 -m-2 hover:bg-muted/50 transition-colors"
                    >
                      <div className="text-xl font-bold tabular-nums">{count}</div>
                      <div
                        className={`w-full h-2 rounded-full ${PICKUP_STATUS_COLORS[status].replace('text-', 'bg-').split(' ')[0]}`}
                        style={{ opacity: count > 0 ? 1 : 0.3 }}
                      />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap font-medium uppercase tracking-wide">
                        {PICKUP_STATUS_LABELS[status]}
                      </span>
                    </Link>
                    {i < PIPELINE_STATUSES.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0 mx-0.5" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Recent Pickups */}
      <section className="space-y-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Pickups</CardTitle>
            <Link
              href="/dashboard/admin/pickups"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              View All <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentPickups.length === 0 ? (
              <p className="text-muted-foreground">No pickups yet.</p>
            ) : (
              <div className="divide-y">
                {recentPickups.map((pickup) => (
                  <Link
                    key={pickup.id}
                    href={`/dashboard/admin/pickups/${pickup.id}`}
                    className="flex items-center justify-between py-3.5 px-1 hover:bg-muted/30 transition-colors rounded-md -mx-1 px-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-8 rounded-full bg-forest/20" />
                      <div>
                        <p className="font-medium text-sm">{pickup.pickup_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {pickup.organizations?.name || "Unknown org"} &middot;{" "}
                          {formatDateDDMMYYYY(pickup.scheduled_date)}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`${PICKUP_STATUS_COLORS[pickup.status]} text-xs`}
                    >
                      {PICKUP_STATUS_LABELS[pickup.status]}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
