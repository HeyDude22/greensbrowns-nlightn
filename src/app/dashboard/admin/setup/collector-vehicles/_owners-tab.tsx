"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { Crown, Truck, X, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { VEHICLE_TYPE_LABELS } from "@/lib/constants";
import type { Vehicle } from "@/types";
import {
  createOwner,
  updateOwner,
  deleteOwner,
  type OwnerFormData,
} from "./actions";

interface Owner {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface VehicleWithDetails extends Vehicle {
  vehicle_drivers?: { driver_id: string; drivers: { name: string } }[];
}

interface OwnersTabProps {
  owners: Owner[];
  vehicles: VehicleWithDetails[];
  fetchOwners: () => Promise<void>;
  fetchVehicles: () => Promise<void>;
}

export function OwnersTab({
  owners,
  vehicles,
  fetchOwners,
  fetchVehicles,
}: OwnersTabProps) {
  const supabase = createClient();

  // Assign vehicle dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingVehicleId, setRemovingVehicleId] = useState<string | null>(null);

  // Create owner dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createFullName, setCreateFullName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit owner dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingOwner, setEditingOwner] = useState<Owner | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editing, setEditing] = useState(false);

  // Delete
  const [deletingOwnerId, setDeletingOwnerId] = useState<string | null>(null);

  // Vehicles owned by a specific owner
  const ownerVehicles = (ownerId: string) =>
    vehicles.filter((v) => v.owner_id === ownerId);

  // Vehicles with no owner assigned yet
  const unassignedVehicles = vehicles.filter((v) => !v.owner_id);

  // ── Assign vehicle ──────────────────────────────────────────────────────────
  function openAssignDialog(owner: Owner) {
    setSelectedOwner(owner);
    setSelectedVehicleId("");
    setAssignDialogOpen(true);
  }

  async function handleAssignVehicle() {
    if (!selectedOwner || !selectedVehicleId) return;
    setSaving(true);

    const { error } = await supabase
      .from("vehicles")
      .update({ owner_id: selectedOwner.id })
      .eq("id", selectedVehicleId);

    if (error) {
      toast.error("Failed to assign vehicle");
      setSaving(false);
      return;
    }

    toast.success("Vehicle assigned to owner");
    await fetchVehicles();
    setAssignDialogOpen(false);
    setSaving(false);
  }

  async function handleRemoveVehicle(vehicleId: string) {
    if (!window.confirm("Remove this vehicle from the owner?")) return;
    setRemovingVehicleId(vehicleId);

    const { error } = await supabase
      .from("vehicles")
      .update({ owner_id: null })
      .eq("id", vehicleId);

    if (error) {
      toast.error("Failed to remove vehicle");
      setRemovingVehicleId(null);
      return;
    }

    toast.success("Vehicle removed from owner");
    await fetchVehicles();
    setRemovingVehicleId(null);
  }

  // ── Create owner ────────────────────────────────────────────────────────────
  function openCreateDialog() {
    setCreateFullName("");
    setCreateEmail("");
    setCreatePhone("");
    setCreateDialogOpen(true);
  }

  async function handleCreateOwner() {
    setCreating(true);
    const result = await createOwner({
      full_name: createFullName,
      email: createEmail,
      phone: createPhone,
    } as OwnerFormData);

    if ("error" in result) {
      toast.error(result.error);
      setCreating(false);
      return;
    }

    toast.success("Owner created successfully");
    await fetchOwners();
    setCreateDialogOpen(false);
    setCreating(false);
  }

  // ── Edit owner ──────────────────────────────────────────────────────────────
  function openEditDialog(owner: Owner) {
    setEditingOwner(owner);
    setEditFullName(owner.full_name ?? "");
    setEditPhone(owner.phone ?? "");
    setEditDialogOpen(true);
  }

  async function handleEditOwner() {
    if (!editingOwner) return;
    setEditing(true);

    const result = await updateOwner(editingOwner.id, {
      full_name: editFullName,
      phone: editPhone,
    });

    if ("error" in result) {
      toast.error(result.error);
      setEditing(false);
      return;
    }

    toast.success("Owner updated");
    await fetchOwners();
    setEditDialogOpen(false);
    setEditing(false);
  }

  // ── Delete owner ────────────────────────────────────────────────────────────
  async function handleDeleteOwner(owner: Owner) {
    if (
      !window.confirm(
        `Delete ${owner.full_name ?? "this owner"}? Their vehicles will be unassigned.`
      )
    )
      return;

    setDeletingOwnerId(owner.id);
    const result = await deleteOwner(owner.id);

    if ("error" in result) {
      toast.error(result.error);
      setDeletingOwnerId(null);
      return;
    }

    toast.success("Owner deleted");
    await fetchOwners();
    await fetchVehicles();
    setDeletingOwnerId(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header with Add Owner button */}
      <div className="flex justify-end">
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Owner
        </Button>
      </div>

      {owners.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Crown}
              title="No owners yet"
              description="Click Add Owner to create the first vehicle owner."
            />
          </CardContent>
        </Card>
      ) : (
        owners.map((owner) => {
          const owned = ownerVehicles(owner.id);
          return (
            <Card key={owner.id}>
              <CardContent className="pt-4 space-y-3">
                {/* Owner header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{owner.full_name ?? "Unnamed Owner"}</p>
                    <p className="text-sm text-muted-foreground">
                      {owner.email ?? "—"}{owner.phone ? ` · ${owner.phone}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditDialog(owner)}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openAssignDialog(owner)}
                    >
                      <Truck className="mr-1 h-3 w-3" />
                      Assign Vehicle
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteOwner(owner)}
                      disabled={deletingOwnerId === owner.id}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      {deletingOwnerId === owner.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>

                {/* Owner's vehicles */}
                {owned.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No vehicles assigned yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Registration</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Capacity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {owned.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell className="font-medium">
                            {v.registration_number}
                          </TableCell>
                          <TableCell>
                            {VEHICLE_TYPE_LABELS[v.vehicle_type] ?? v.vehicle_type}
                          </TableCell>
                          <TableCell>{v.capacity_kg} kg</TableCell>
                          <TableCell>
                            <Badge variant={v.is_active ? "default" : "secondary"}>
                              {v.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveVehicle(v.id)}
                              disabled={removingVehicleId === v.id}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Create Owner Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Owner</DialogTitle>
            <DialogDescription>
              Create a new vehicle owner account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={createFullName}
                onChange={(e) => setCreateFullName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="owner@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                type="tel"
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
                placeholder="+919731296263"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOwner} disabled={creating}>
              {creating ? "Creating..." : "Create Owner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Owner Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Owner</DialogTitle>
            <DialogDescription>
              Update owner details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={editingOwner?.email ?? ""}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed here.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+919731296263"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditOwner} disabled={editing}>
              {editing ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Vehicle Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Vehicle</DialogTitle>
            <DialogDescription>
              Assign an unowned vehicle to{" "}
              {selectedOwner?.full_name ?? "this owner"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Select Vehicle</Label>
            {unassignedVehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All vehicles are already assigned to an owner.
              </p>
            ) : (
              <Select
                value={selectedVehicleId}
                onValueChange={setSelectedVehicleId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedVehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.registration_number} —{" "}
                      {VEHICLE_TYPE_LABELS[v.vehicle_type] ?? v.vehicle_type} (
                      {v.capacity_kg} kg)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssignVehicle}
              disabled={saving || !selectedVehicleId}
            >
              {saving ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}