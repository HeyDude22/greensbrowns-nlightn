"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { Crown, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { VEHICLE_TYPE_LABELS } from "@/lib/constants";
import type { Vehicle } from "@/types";

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

export function OwnersTab({ owners, vehicles, fetchOwners, fetchVehicles }: OwnersTabProps) {
  const supabase = createClient();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingVehicleId, setRemovingVehicleId] = useState<string | null>(null);

  // Vehicles owned by selected owner
  const ownerVehicles = (ownerId: string) =>
    vehicles.filter((v) => v.owner_id === ownerId);

  // Vehicles with no owner assigned yet
  const unassignedVehicles = vehicles.filter((v) => !v.owner_id);

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
      console.error(error);
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
      console.error(error);
      setRemovingVehicleId(null);
      return;
    }

    toast.success("Vehicle removed from owner");
    await fetchVehicles();
    setRemovingVehicleId(null);
  }

  if (owners.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={Crown}
            title="No owners yet"
            description="Create a user with the owner role to get started."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {owners.map((owner) => {
        const owned = ownerVehicles(owner.id);
        return (
          <Card key={owner.id}>
            <CardContent className="pt-4 space-y-3">
              {/* Owner header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{owner.full_name ?? "Unnamed Owner"}</p>
                  <p className="text-sm text-muted-foreground">
                    {owner.email ?? "—"} {owner.phone ? `· ${owner.phone}` : ""}
                  </p>
                </div>
                <Button size="sm" onClick={() => openAssignDialog(owner)}>
                  <Truck className="mr-2 h-4 w-4" />
                  Assign Vehicle
                </Button>
              </div>

              {/* Owner's vehicles */}
              {owned.length === 0 ? (
                <p className="text-sm text-muted-foreground">No vehicles assigned yet.</p>
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
      })}

      {/* Assign Vehicle Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Vehicle</DialogTitle>
            <DialogDescription>
              Assign an unowned vehicle to {selectedOwner?.full_name ?? "this owner"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Select Vehicle</Label>
            {unassignedVehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All vehicles are already assigned to an owner.
              </p>
            ) : (
              <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedVehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.registration_number} — {VEHICLE_TYPE_LABELS[v.vehicle_type] ?? v.vehicle_type} ({v.capacity_kg} kg)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
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