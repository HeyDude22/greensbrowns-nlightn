"use client";

import { Fragment, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import LocationPicker from "@/components/shared/location-picker-dynamic";
import { COMPOST_TYPE_OPTIONS } from "@/lib/constants";
import { buildOsmEmbedUrl } from "@/lib/utils";
import {
  Sprout,
  Plus,
  Pencil,
  ChevronDown,
  ChevronRight,
  MapPin,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { toast } from "sonner";
import { createFarmer, updateFarmer } from "./actions";

interface FarmerRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  farmer_details: {
    farm_name: string | null;
    farm_address: string | null;
    farm_lat: number | null;
    farm_lng: number | null;
    land_area_acres: number | null;
    capacity_kg_per_month: number | null;
    compost_types: string[];
    is_active: boolean;
    notes: string | null;
  } | null;
  pickup_count: number;
}

interface FormState {
  full_name: string;
  phone: string;
  farm_name: string;
  farm_address: string;
  farm_lat: number | null;
  farm_lng: number | null;
  land_area_acres: string;
  capacity_kg_per_month: string;
  compost_types: string[];
  notes: string;
}

const emptyForm: FormState = {
  full_name: "",
  phone: "",
  farm_name: "",
  farm_address: "",
  farm_lat: null,
  farm_lng: null,
  land_area_acres: "",
  capacity_kg_per_month: "",
  compost_types: [],
  notes: "",
};

export default function AdminFarmersPage() {
  const supabase = createClient();
  const [farmers, setFarmers] = useState<FarmerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function fetchFarmers() {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone, created_at, farmer_details(*)")
      .eq("role", "farmer")
      .order("created_at", { ascending: false });

    if (!data) {
      setLoading(false);
      return;
    }

    // Batch pickup counts
    const farmerIds = data.map((f) => f.id);
    const { data: pickupRows } = await supabase
      .from("pickups")
      .select("farmer_id")
      .in("farmer_id", farmerIds);

    const countMap = new Map<string, number>();
    for (const p of pickupRows || []) {
      if (p.farmer_id) countMap.set(p.farmer_id, (countMap.get(p.farmer_id) || 0) + 1);
    }

    const farmersWithCounts = data.map((f) => ({
      ...f,
      farmer_details: Array.isArray(f.farmer_details)
        ? f.farmer_details[0] ?? null
        : f.farmer_details,
      pickup_count: countMap.get(f.id) || 0,
    } as FarmerRow));

    setFarmers(farmersWithCounts);
    setLoading(false);
  }

  useEffect(() => {
    fetchFarmers();
  }, [supabase]);

  function openCreateDialog() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(farmer: FarmerRow) {
    setEditingId(farmer.id);
    setForm({
      full_name: farmer.full_name || "",
      phone: farmer.phone || "",
      farm_name: farmer.farmer_details?.farm_name || "",
      farm_address: farmer.farmer_details?.farm_address || "",
      farm_lat: farmer.farmer_details?.farm_lat ?? null,
      farm_lng: farmer.farmer_details?.farm_lng ?? null,
      land_area_acres: farmer.farmer_details?.land_area_acres?.toString() || "",
      capacity_kg_per_month:
        farmer.farmer_details?.capacity_kg_per_month?.toString() || "",
      compost_types: farmer.farmer_details?.compost_types || [],
      notes: farmer.farmer_details?.notes || "",
    });
    setDialogOpen(true);
  }

  function toggleCompostType(value: string) {
    setForm((prev) => ({
      ...prev,
      compost_types: prev.compost_types.includes(value)
        ? prev.compost_types.filter((t) => t !== value)
        : [...prev.compost_types, value],
    }));
  }

  async function handleSubmit() {
    if (!form.full_name || !form.phone) {
      toast.error("Name and phone are required");
      return;
    }

    setSubmitting(true);

    const payload = {
      full_name: form.full_name,
      phone: form.phone,
      farm_name: form.farm_name || undefined,
      farm_address: form.farm_address || undefined,
      farm_lat: form.farm_lat ?? undefined,
      farm_lng: form.farm_lng ?? undefined,
      land_area_acres: form.land_area_acres
        ? parseFloat(form.land_area_acres)
        : undefined,
      capacity_kg_per_month: form.capacity_kg_per_month
        ? parseFloat(form.capacity_kg_per_month)
        : undefined,
      compost_types:
        form.compost_types.length > 0 ? form.compost_types : undefined,
      notes: form.notes || undefined,
    };

    const result = editingId
      ? await updateFarmer(editingId, payload)
      : await createFarmer(payload);

    if (result.error) {
      toast.error(result.error);
      setSubmitting(false);
      return;
    }

    toast.success(editingId ? "Processor updated" : "Processor created");
    setDialogOpen(false);
    setSubmitting(false);
    setLoading(true);
    fetchFarmers();
  }

  async function toggleFarmerActive(farmer: FarmerRow) {
    const newVal = !(farmer.farmer_details?.is_active ?? true);
    const { error } = await supabase
      .from("farmer_details")
      .update({ is_active: newVal })
      .eq("profile_id", farmer.id);

    if (error) {
      toast.error("Failed to update status");
      return;
    }

    setFarmers((prev) =>
      prev.map((f) =>
        f.id === farmer.id
          ? {
              ...f,
              farmer_details: f.farmer_details
                ? { ...f.farmer_details, is_active: newVal }
                : f.farmer_details,
            }
          : f
      )
    );
    toast.success(newVal ? "Processor activated" : "Processor deactivated");
  }

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Processors"
        description="Manage processors and facility details"
        action={
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" /> Add Processor
          </Button>
        }
      />

      {farmers.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Sprout}
              title="No processors"
              description="No processors have been added yet. Click 'Add Processor' to create one."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Farm</TableHead>
                  <TableHead>Capacity (kg/mo)</TableHead>
                  <TableHead>Pickups</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {farmers.map((farmer) => (
                  <Fragment key={farmer.id}>
                    <TableRow>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() =>
                            setExpandedId(
                              expandedId === farmer.id ? null : farmer.id
                            )
                          }
                        >
                          {expandedId === farmer.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">
                        {farmer.full_name || "\u2014"}
                      </TableCell>
                      <TableCell>{farmer.phone || "\u2014"}</TableCell>
                      <TableCell>
                        {farmer.farmer_details?.farm_name || "\u2014"}
                      </TableCell>
                      <TableCell>
                        {farmer.farmer_details?.capacity_kg_per_month ?? "\u2014"}
                      </TableCell>
                      <TableCell>{farmer.pickup_count}</TableCell>
                      <TableCell>
                        {new Date(farmer.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            (farmer.farmer_details?.is_active ?? true)
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }
                        >
                          {(farmer.farmer_details?.is_active ?? true) ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(farmer)}
                        >
                          <Pencil className="mr-1 h-3 w-3" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleFarmerActive(farmer)}
                          title={(farmer.farmer_details?.is_active ?? true) ? "Deactivate" : "Activate"}
                        >
                          {(farmer.farmer_details?.is_active ?? true) ? (
                            <ToggleRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-gray-400" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {expandedId === farmer.id && (
                      <TableRow>
                        <TableCell colSpan={9} className="bg-muted/50 p-4">
                          <div className="grid gap-3 text-sm md:grid-cols-2">
                            <div>
                              <span className="text-muted-foreground">
                                Farm Address:
                              </span>{" "}
                              {farmer.farmer_details?.farm_address || "\u2014"}
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Land Area:
                              </span>{" "}
                              {farmer.farmer_details?.land_area_acres
                                ? `${farmer.farmer_details.land_area_acres} acres`
                                : "\u2014"}
                            </div>
                            {farmer.farmer_details?.farm_lat &&
                              farmer.farmer_details?.farm_lng && (
                                <>
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-muted-foreground">
                                      {farmer.farmer_details.farm_lat.toFixed(4)},{" "}
                                      {farmer.farmer_details.farm_lng.toFixed(4)}
                                    </span>
                                  </div>
                                  <div className="md:col-span-2 rounded-md overflow-hidden border h-[150px]">
                                    <iframe
                                      title="Farm location"
                                      width="100%"
                                      height="150"
                                      style={{ border: 0 }}
                                      loading="lazy"
                                      src={buildOsmEmbedUrl(farmer.farmer_details.farm_lat, farmer.farmer_details.farm_lng)}
                                    />
                                  </div>
                                </>
                              )}
                            <div className="md:col-span-2">
                              <span className="text-muted-foreground">
                                Compost Types:
                              </span>{" "}
                              {farmer.farmer_details?.compost_types &&
                              farmer.farmer_details.compost_types.length > 0 ? (
                                <span className="inline-flex flex-wrap gap-1 ml-1">
                                  {farmer.farmer_details.compost_types.map(
                                    (t) => (
                                      <Badge
                                        key={t}
                                        variant="secondary"
                                        className="text-xs"
                                      >
                                        {COMPOST_TYPE_OPTIONS.find(
                                          (o) => o.value === t
                                        )?.label || t}
                                      </Badge>
                                    )
                                  )}
                                </span>
                              ) : (
                                "\u2014"
                              )}
                            </div>
                            {farmer.farmer_details?.notes && (
                              <div className="md:col-span-2">
                                <span className="text-muted-foreground">
                                  Notes:
                                </span>{" "}
                                {farmer.farmer_details.notes}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Processor" : "Add Processor"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Profile</h4>
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={(e) =>
                    setForm({ ...form, full_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Farm Details</h4>
              <div className="space-y-2">
                <Label htmlFor="farm_name">Farm Name</Label>
                <Input
                  id="farm_name"
                  value={form.farm_name}
                  onChange={(e) =>
                    setForm({ ...form, farm_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="farm_address">Farm Address</Label>
                <Input
                  id="farm_address"
                  value={form.farm_address}
                  onChange={(e) =>
                    setForm({ ...form, farm_address: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Farm Location</Label>
                <LocationPicker
                  lat={form.farm_lat}
                  lng={form.farm_lng}
                  onChange={(lat, lng) =>
                    setForm({ ...form, farm_lat: lat, farm_lng: lng })
                  }
                  height={250}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="land_area_acres">Land Area (acres)</Label>
                  <Input
                    id="land_area_acres"
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.land_area_acres}
                    onChange={(e) =>
                      setForm({ ...form, land_area_acres: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacity_kg_per_month">
                    Capacity (kg/month)
                  </Label>
                  <Input
                    id="capacity_kg_per_month"
                    type="number"
                    min="0"
                    value={form.capacity_kg_per_month}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        capacity_kg_per_month: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Compost Types</Label>
                <div className="grid grid-cols-2 gap-2">
                  {COMPOST_TYPE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={form.compost_types.includes(opt.value)}
                        onCheckedChange={() => toggleCompostType(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? "Saving..."
                : editingId
                  ? "Update Processor"
                  : "Create Processor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
