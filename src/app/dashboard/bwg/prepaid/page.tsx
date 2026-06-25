"use client";

import { useEffect, useState } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
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
import { StatCard } from "@/components/shared/stat-card";
import { CreditCard, Clock, Package, CalendarDays, Truck } from "lucide-react";
import { toast } from "sonner";
import { formatPaise, formatDateDDMMYYYY } from "@/lib/utils";
import {
  sumAvailableCredits,
  isUsablePrepaidPackage,
  getPrepaidPackageDisplayStatus,
  PREPAID_DISPLAY_STATUS_LABELS,
  PREPAID_DISPLAY_STATUS_COLORS,
  remainingCredits,
} from "@/lib/prepaid-credits";
import type { PrepaidPackage, PrepaidPackagePlan } from "@/types";

interface PrepaidPackageWithPlan extends PrepaidPackage {
  prepaid_package_plans: { name: string } | null;
}

interface AssignedPackageWithPlan {
  id: string;
  plan_id: string;
  price_paise: number;
  is_active: boolean;
  prepaid_package_plans: PrepaidPackagePlan;
}

export default function BwgPrepaidPage() {
  const { user, orgId: memberOrgId, loading: orgLoading, supabase } = useOrganization();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgActive, setOrgActive] = useState(true);
  const [packages, setPackages] = useState<PrepaidPackageWithPlan[]>([]);
  const [assignedPackages, setAssignedPackages] = useState<AssignedPackageWithPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function fetchPackages(organizationId: string) {
    const { data } = await supabase
      .from("prepaid_packages")
      .select("*, prepaid_package_plans(name)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (data) setPackages(data as PrepaidPackageWithPlan[]);
  }

  async function fetchAssignedPackages(organizationId: string) {
    const { data } = await supabase
      .from("assigned_packages")
      .select("id, plan_id, price_paise, is_active, prepaid_package_plans(*)")
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    if (data) setAssignedPackages(data as unknown as AssignedPackageWithPlan[]);
  }

  useEffect(() => {
    if (orgLoading || !user) return;
    if (!memberOrgId) {
      setLoading(false);
      return;
    }
    async function fetchData() {
      setOrgId(memberOrgId);
      const orgPromise = supabase
        .from("organizations")
        .select("is_active")
        .eq("id", memberOrgId!)
        .single();
      const [orgRes] = await Promise.all([
        orgPromise,
        fetchPackages(memberOrgId!),
        fetchAssignedPackages(memberOrgId!),
      ]);
      setOrgActive(orgRes.data?.is_active ?? true);
      setLoading(false);
    }
    fetchData();
  }, [user, memberOrgId, orgLoading, supabase]);

  async function handleSelectPlan(assignedPkg: AssignedPackageWithPlan) {
    if (!orgId || !user) return;
    if (!orgActive) {
      toast.error(
        "Your organization is suspended and cannot purchase plans. Please contact GreensBrowns support.",
      );
      return;
    }

    setSubmitting(assignedPkg.id);
    const plan = assignedPkg.prepaid_package_plans;

    const { error } = await supabase.from("prepaid_packages").insert({
      organization_id: orgId,
      requested_by: user.id,
      pickup_count: plan.pickup_count,
      plan_id: assignedPkg.plan_id,
      notes: `Selected plan: ${plan.name} (${formatPaise(assignedPkg.price_paise)})`,
    });

    if (error) {
      toast.error("Failed to submit request. Please try again.");
      setSubmitting(null);
      return;
    }

    toast.success("Prepaid request submitted! Awaiting admin approval.");
    await fetchPackages(orgId);
    setSubmitting(null);
  }

  const availableCredits = sumAvailableCredits(packages);

  const pendingRequests = packages.filter(
    (pkg) => pkg.status === "pending"
  ).length;

  const hasUsableCredits = packages.some(isUsablePrepaidPackage);

  const hasPendingRequest = pendingRequests > 0;

  const canRequestNew = !hasUsableCredits && !hasPendingRequest && orgActive;

  if (orgLoading || loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prepaid Packages"
        description="Select a plan assigned by admin and manage your pickup credits"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <StatCard
          title="Remaining Credits"
          value={availableCredits}
          icon={CreditCard}
        />
        <StatCard
          title="Pending Requests"
          value={pendingRequests}
          icon={Clock}
        />
      </div>

      {!orgActive && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Your organization is suspended and cannot purchase plans. Please contact GreensBrowns support to reactivate your account.
        </div>
      )}

      {orgActive && !canRequestNew && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {hasUsableCredits
            ? "You have remaining pickup credits on an approved package. You can request a new package once your credits are used up or the validity period ends."
            : "You have a pending prepaid request awaiting admin approval. Please wait for it to be processed before submitting another."}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Available Plans</h2>
        {assignedPackages.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <EmptyState
                icon={Package}
                title="No plans assigned"
                description="Your admin has not assigned any prepaid plans to your organization yet. Please contact your admin."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {assignedPackages.map((ap) => {
              const plan = ap.prepaid_package_plans;
              return (
                <Card key={ap.id} className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    <CardDescription>
                      {formatPaise(ap.price_paise)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Truck className="h-4 w-4" />
                      <span>{plan.pickup_count} pickup credits</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CalendarDays className="h-4 w-4" />
                      <span>{plan.validity_days} days validity</span>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full"
                      disabled={!canRequestNew || submitting === ap.id}
                      onClick={() => handleSelectPlan(ap)}
                    >
                      {submitting === ap.id ? "Submitting..." : "Select Plan"}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Package purchase history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {packages.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CreditCard}
                title="No prepaid packages"
                description="Select a plan above to request prepaid pickup credits."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Pickup Credits</TableHead>
                  <TableHead>Used Credit</TableHead>
                  <TableHead>Remaining Credits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => {
                  const displayStatus = getPrepaidPackageDisplayStatus(pkg);
                  return (
                    <TableRow key={pkg.id}>
                      <TableCell>
                        {formatDateDDMMYYYY(pkg.created_at)}
                      </TableCell>
                      <TableCell>
                        {pkg.prepaid_package_plans?.name ?? "\u2014"}
                      </TableCell>
                      <TableCell>{pkg.pickup_count}</TableCell>
                      <TableCell>{pkg.used_count}</TableCell>
                      <TableCell>
                        {pkg.status === "approved" ||
                        pkg.status === "exhausted"
                          ? remainingCredits(pkg)
                          : "\u2014"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={PREPAID_DISPLAY_STATUS_COLORS[displayStatus]}
                        >
                          {PREPAID_DISPLAY_STATUS_LABELS[displayStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {pkg.expires_at
                          ? formatDateDDMMYYYY(pkg.expires_at)
                          : "\u2014"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
