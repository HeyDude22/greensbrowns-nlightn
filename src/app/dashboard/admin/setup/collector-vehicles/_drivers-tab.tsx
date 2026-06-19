"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Plus,
  UserCheck,
  Upload,
  Pencil,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateDDMMYYYY } from "@/lib/utils";
import { extractLicenseDetails } from "@/lib/ocr";
import { createDriver, updateDriver } from "./actions";
import type { Driver, Vehicle } from "@/types";

interface DriverWithVehicles extends Driver {
  vehicle_drivers?: { vehicle_id: string; vehicles: { id: string; registration_number: string } }[];
}

interface VehicleWithDetails extends Vehicle {
  vehicle_drivers?: { driver_id: string; drivers: Driver }[];
}

interface DriversTabProps {
  drivers: DriverWithVehicles[];
  vehicles: VehicleWithDetails[];
  fetchDrivers: () => Promise<void>;
  fetchVehicles: () => Promise<void>;
}

export function DriversTab({ drivers, vehicles, fetchDrivers, fetchVehicles }: DriversTabProps) {
  const supabase = createClient();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DriverWithVehicles | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [driverName, setDriverName] = useState("");
  const [driverLicense, setDriverLicense] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverValidTill, setDriverValidTill] = useState("");
  const [driverLicenseFile, setDriverLicenseFile] = useState<File | null>(null);
  const [dlOcrRunning, setDlOcrRunning] = useState(false);
  const [dlOcrProgress, setDlOcrProgress] = useState<number | null>(null);

  // Vehicle assignment state (in edit mode)
  const [assignVehicleId, setAssignVehicleId] = useState("");

  function resetForm() {
    setDriverName("");
    setDriverLicense("");
    setDriverPhone("");
    setDriverValidTill("");
    setDriverLicenseFile(null);
    setDlOcrRunning(false);
    setDlOcrProgress(null);
    setAssignVehicleId("");
  }

  function openAddDialog() {
    resetForm();
    setEditingDriver(null);
    setDialogOpen(true);
  }

  function openEditDialog(driver: DriverWithVehicles) {
    setEditingDriver(driver);
    setDriverName(driver.name);
    setDriverLicense(driver.license_number);
    setDriverPhone(driver.phone || "");
    setDriverValidTill(driver.license_valid_till?.split("T")[0] || "");
    setDriverLicenseFile(null);
    setDlOcrRunning(false);
    setDlOcrProgress(null);
    setAssignVehicleId("");
    setDialogOpen(true);
  }

  async function handleDlUpload(file: File) {
    setDriverLicenseFile(file);
    setDlOcrRunning(true);
    setDlOcrProgress(0);

    try {
      const { licenseNumber, name, validTill } = await extractLicenseDetails(file, setDlOcrProgress);
      const extracted: string[] = [];

      if (licenseNumber) {
        setDriverLicense(licenseNumber);
        extracted.push(`DL: ${licenseNumber}`);
      }
      if (name) {
        setDriverName(name);
        extracted.push(`Name: ${name}`);
      }
      if (validTill) {
        setDriverValidTill(validTill);
        extracted.push(`Valid till: ${validTill}`);
      }

      if (extracted.length > 0) {
        toast.success(`Extracted: ${extracted.join(", ")}`);
      } else {
        toast.info("Could not extract details — please enter manually");
      }
    } catch {
      toast.error("OCR failed — please enter details manually");
    } finally {
      setDlOcrRunning(false);
      setDlOcrProgress(null);
    }
  }

  async function handleSaveDriver() {
    if (!driverLicense.trim() || !driverName.trim()) {
      toast.error("Driver name and license number are required");
      return;
    }
    if (!driverPhone.trim()) {
      toast.error("WhatsApp phone number is required");
      return;
    }
    setSaving(true);

    // Upload DL photo if provided
    let licensePhotoPath: string | null = editingDriver?.license_photo_path ?? null;
    if (driverLicenseFile) {
      const ext = driverLicenseFile.name.split(".").pop() || "jpg";
      const dlKey = driverLicense.trim().toUpperCase().replace(/\s+/g, "");
      const filePath = `driver-licenses/${dlKey}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("vehicle-docs")
        .upload(filePath, driverLicenseFile, { upsert: true });

      if (uploadError) {
        console.error("Failed to upload DL photo:", uploadError);
        toast.error("Failed to upload license photo, but will continue saving driver");
      } else {
        licensePhotoPath = filePath;
      }
    }

    const driverPayload = {
      name: driverName.trim(),
      license_number: driverLicense.trim().toUpperCase(),
      phone: driverPhone.trim(),
      license_photo_path: licensePhotoPath,
      license_valid_till: driverValidTill || null,
    };

    if (editingDriver) {
      const result = await updateDriver(editingDriver.id, driverPayload);
      if (result.error) {
        toast.error(result.error);
        setSaving(false);
        return;
      }
      toast.success(
        result.migrated
          ? "Driver linked to collector account (auth + profile created)"
          : "Driver updated"
      );
    } else {
      const result = await createDriver(driverPayload);
      if (result.error) {
        toast.error(result.error);
        setSaving(false);
        return;
      }
      toast.success("Driver added with collector login");
    }

    setDialogOpen(false);
    setSaving(false);
    fetchDrivers();
  }

  async function toggleActive(driver: DriverWithVehicles) {
    const { error } = await supabase
      .from("drivers")
      .update({ is_active: !driver.is_active })
      .eq("id", driver.id);

    if (error) {
      toast.error("Failed to update driver");
      return;
    }

    toast.success(driver.is_active ? "Driver deactivated" : "Driver activated");
    fetchDrivers();
  }

  async function assignVehicle(driverId: string, vehicleId: string) {
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("vehicle_drivers")
      .insert({
        vehicle_id: vehicleId,
        driver_id: driverId,
        assigned_by: user?.id,
      });

    if (error) {
      if (error.code === "23505") {
        toast.error("Driver is already assigned to this vehicle");
      } else {
        toast.error("Failed to assign vehicle");
        console.error(error);
      }
      return;
    }

    toast.success("Vehicle assigned");
    setAssignVehicleId("");
    fetchDrivers();
    fetchVehicles();
  }

  async function removeVehicleAssignment(driverId: string, vehicleId: string) {
    const { error } = await supabase
      .from("vehicle_drivers")
      .delete()
      .eq("vehicle_id", vehicleId)
      .eq("driver_id", driverId);

    if (error) {
      toast.error("Failed to remove assignment");
      return;
    }

    toast.success("Assignment removed");
    fetchDrivers();
    fetchVehicles();
  }

  const today = new Date().toISOString().split("T")[0];

  // Vehicles not yet assigned to the current editing driver
  const availableVehicles = editingDriver
    ? vehicles.filter(
        (v) =>
          v.is_active &&
          !editingDriver.vehicle_drivers?.some((vd) => vd.vehicle_id === v.id)
      )
    : vehicles.filter((v) => v.is_active);

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" /> Add Driver
        </Button>
      </div>

      {drivers.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={UserCheck}
              title="No drivers registered"
              description="Add the first driver to get started."
              action={
                <Button onClick={openAddDialog}>
                  <Plus className="mr-2 h-4 w-4" /> Add Driver
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>License #</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Valid Till</TableHead>
                  <TableHead>Vehicles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((driver) => {
                  const isExpired = driver.license_valid_till && driver.license_valid_till.split("T")[0] <= today;
                  const vehicleNames = driver.vehicle_drivers
                    ?.map((vd) => vd.vehicles.registration_number)
                    .join(", ");
                  return (
                    <TableRow key={driver.id}>
                      <TableCell className="font-medium">{driver.name}</TableCell>
                      <TableCell className="font-mono text-sm">{driver.license_number}</TableCell>
                      <TableCell className="text-sm">{driver.phone || "—"}</TableCell>
                      <TableCell>
                        {driver.license_valid_till ? (
                          <span className={`text-sm ${isExpired ? "text-red-600 font-medium" : ""}`}>
                            {formatDateDDMMYYYY(driver.license_valid_till)}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {vehicleNames ? (
                          <span className="text-sm font-mono">{vehicleNames}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            driver.is_active
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }
                        >
                          {driver.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(driver)}
                            title="Edit driver"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleActive(driver)}
                            title={driver.is_active ? "Deactivate" : "Activate"}
                          >
                            {driver.is_active ? (
                              <ToggleRight className="h-4 w-4 text-green-600" />
                            ) : (
                              <ToggleLeft className="h-4 w-4 text-gray-400" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Driver Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDriver ? "Edit Driver" : "Add Driver"}</DialogTitle>
            <DialogDescription>
              {editingDriver
                ? `Update details for ${editingDriver.name}`
                : "Upload DL photo to auto-fill details, or enter manually"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* DL Photo Upload */}
            <div className="space-y-1">
              <Label>Driving License Photo</Label>
              <label className="block cursor-pointer">
                <div className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-muted-foreground hover:border-gray-400 transition-colors">
                  <Upload className="h-3 w-3" />
                  {driverLicenseFile
                    ? driverLicenseFile.name
                    : editingDriver?.license_photo_path
                    ? "Replace DL photo..."
                    : "Upload DL photo to auto-fill..."}
                </div>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleDlUpload(file);
                  }}
                />
              </label>
              {dlOcrRunning && dlOcrProgress !== null && (
                <div className="space-y-1">
                  <Progress value={dlOcrProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground">Reading license details... {dlOcrProgress}%</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="driverName">Name</Label>
                <Input
                  id="driverName"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="Driver name"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="driverLicense">License Number</Label>
                <Input
                  id="driverLicense"
                  value={driverLicense}
                  onChange={(e) => setDriverLicense(e.target.value)}
                  placeholder="e.g. KA0120210012345"
                  disabled={!!editingDriver}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="driverPhone">WhatsApp Phone Number *</Label>
                <Input
                  id="driverPhone"
                  type="tel"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder="+91..."
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Used for dispatch notifications via WhatsApp
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="driverValidTill">License Valid Till *</Label>
                <Input
                  id="driverValidTill"
                  type="date"
                  value={driverValidTill}
                  onChange={(e) => setDriverValidTill(e.target.value)}
                  required
                />
                {driverValidTill && driverValidTill <= today && (
                  <p className="text-xs text-red-600 font-medium">
                    This license has expired
                  </p>
                )}
              </div>
            </div>

            {/* Vehicle Assignments (Edit mode only) */}
            {editingDriver && (
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium">Vehicle Assignments</p>

                {(editingDriver.vehicle_drivers?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No vehicles assigned</p>
                ) : (
                  <div className="space-y-2">
                    {editingDriver.vehicle_drivers?.map((vd) => (
                      <div
                        key={vd.vehicle_id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <span className="text-sm font-mono">
                          {vd.vehicles.registration_number}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeVehicleAssignment(editingDriver.id, vd.vehicle_id)}
                        >
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {availableVehicles.length > 0 && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Assign to Vehicle</Label>
                      <Select value={assignVehicleId} onValueChange={setAssignVehicleId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select vehicle..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableVehicles.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.registration_number}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      disabled={!assignVehicleId}
                      onClick={() => assignVehicle(editingDriver.id, assignVehicleId)}
                    >
                      Assign
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveDriver}
              disabled={saving || dlOcrRunning}
            >
              {saving ? "Saving..." : editingDriver ? "Save Changes" : "Add Driver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
