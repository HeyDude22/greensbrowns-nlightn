"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { Package, Plus, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { formatDateDDMMYYYY } from "@/lib/utils";

interface PrepaidPlan {
  id: string;
  name: string;
  pickup_count: number;
  validity_days: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const emptyForm = {
  name: "",
  pickup_count: "",
  validity_days: "",
};

export default function SetupPrepaidPackagesPage() {
  const supabase = createClient();
  const [plans, setPlans] = useState<PrepaidPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PrepaidPlan | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchPlans();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchPlans() {
    const { data, error } = await supabase
      .from("prepaid_package_plans")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load plans");
      console.error(error);
    }
    if (data) setPlans(data as unknown as PrepaidPlan[]);
    setLoading(false);
  }

  function openCreateDialog() {
    setEditingPlan(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(plan: PrepaidPlan) {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      pickup_count: String(plan.pickup_count),
      validity_days: String(plan.validity_days),
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const name = form.name.trim();
    const pickupCount = parseInt(form.pickup_count, 10);
    const validityDays = parseInt(form.validity_days, 10);

    if (!name) {
      toast.error("Plan name is required");
      setSaving(false);
      return;
    }
    if (isNaN(pickupCount) || pickupCount < 1) {
      toast.error("Pickup count must be at least 1");
      setSaving(false);
      return;
    }
    if (isNaN(validityDays) || validityDays < 1) {
      toast.error("Validity must be at least 1 day");
      setSaving(false);
      return;
    }

    if (editingPlan) {
      const { error } = await supabase
        .from("prepaid_package_plans")
        .update({
          name,
          pickup_count: pickupCount,
          validity_days: validityDays,
        })
        .eq("id", editingPlan.id);

      if (error) {
        toast.error("Failed to update plan");
        console.error(error);
        setSaving(false);
        return;
      }

      setPlans((prev) =>
        prev.map((p) =>
          p.id === editingPlan.id
            ? {
                ...p,
                name,
                pickup_count: pickupCount,
                validity_days: validityDays,
              }
            : p
        )
      );
      toast.success("Plan updated");
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("prepaid_package_plans")
        .insert({
          name,
          pickup_count: pickupCount,
          validity_days: validityDays,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (error) {
        toast.error("Failed to create plan");
        console.error(error);
        setSaving(false);
        return;
      }

      if (data) {
        setPlans((prev) => [data as unknown as PrepaidPlan, ...prev]);
      }
      toast.success("Plan created");
    }

    setSaving(false);
    setDialogOpen(false);
    setForm(emptyForm);
    setEditingPlan(null);
  }

  async function toggleActive(plan: PrepaidPlan) {
    const newActive = !plan.is_active;
    const { error } = await supabase
      .from("prepaid_package_plans")
      .update({ is_active: newActive })
      .eq("id", plan.id);

    if (error) {
      toast.error("Failed to update plan status");
      return;
    }

    setPlans((prev) =>
      prev.map((p) => (p.id === plan.id ? { ...p, is_active: newActive } : p))
    );
    toast.success(newActive ? "Plan activated" : "Plan deactivated");
  }

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prepaid Package Plans"
        description="Define prepaid pickup package templates that BWGs can purchase"
        action={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" /> New Plan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingPlan ? "Edit Plan" : "Create New Plan"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingPlan
                      ? "Update the prepaid package plan details."
                      : "Define a new prepaid package plan that BWGs can subscribe to."}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Plan Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g. Basic 10 Pickups"
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="pickup_count">Number of Pickups</Label>
                    <Input
                      id="pickup_count"
                      type="number"
                      min={1}
                      placeholder="e.g. 10"
                      value={form.pickup_count}
                      onChange={(e) =>
                        setForm({ ...form, pickup_count: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="validity_days">
                      Validity Period (days)
                    </Label>
                    <Input
                      id="validity_days"
                      type="number"
                      min={1}
                      placeholder="e.g. 90"
                      value={form.validity_days}
                      onChange={(e) =>
                        setForm({ ...form, validity_days: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving
                      ? "Saving..."
                      : editingPlan
                        ? "Update Plan"
                        : "Create Plan"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {plans.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Package}
              title="No plans defined"
              description="Create your first prepaid package plan to get started."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Plans</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan Name</TableHead>
                  <TableHead>Pickups</TableHead>
                  <TableHead>Validity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell>{plan.pickup_count} pickups</TableCell>
                    <TableCell>{plan.validity_days} days</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          plan.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }
                      >
                        {plan.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDateDDMMYYYY(plan.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(plan)}
                        >
                          <Pencil className="mr-1 h-3 w-3" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleActive(plan)}
                          title={
                            plan.is_active ? "Deactivate plan" : "Activate plan"
                          }
                        >
                          {plan.is_active ? (
                            <ToggleRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-gray-400" />
                          )}
                        </Button>
                      </div>
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
