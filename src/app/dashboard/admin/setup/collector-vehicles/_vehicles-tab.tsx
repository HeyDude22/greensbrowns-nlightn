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
  Truck,
  Upload,
  FileText,
  Download,
  ToggleLeft,
  ToggleRight,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateDDMMYYYY } from "@/lib/utils";
import {
  VEHICLE_TYPE_LABELS,
  VEHICLE_TYPE_DETAILS,
  VEHICLE_DOC_LABELS,
} from "@/lib/constants";
import { extractRegistrationNumber } from "@/lib/ocr";
import type { Vehicle, VehicleType, VehicleDocType, VehicleDocument, Driver } from "@/types";

interface VehicleWithDetails extends Vehicle {
  vehicle_documents?: VehicleDocument[];
  vehicle_drivers?: { driver_id: string; drivers: Driver }[];
}

interface VehiclesTabProps {
  vehicles: VehicleWithDetails[];
  fetchVehicles: () => Promise<void>;
}

const DOC_TYPES: VehicleDocType[] = ["rc", "insurance", "tax_receipt", "emission_cert", "fitness_cert"];
const DOC_TYPES_WITH_EXPIRY: VehicleDocType[] = ["insurance", "emission_cert", "fitness_cert"];

export function VehiclesTab({ vehicles, fetchVehicles }: VehiclesTabProps) {
  const supabase = createClient();

  // Add vehicle dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regNumber, setRegNumber] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("auto");
  const [capacity, setCapacity] = useState("400");
  const [volumeCapacity, setVolumeCapacity] = useState("2.5");
  const [docFiles, setDocFiles] = useState<Partial<Record<VehicleDocType, File>>>({});
  const [docExpiry, setDocExpiry] = useState<Partial<Record<VehicleDocType, string>>>({});
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);

  // Edit vehicle dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleWithDetails | null>(null);
  const [editVehicleType, setEditVehicleType] = useState<VehicleType>("auto");
  const [editCapacity, setEditCapacity] = useState("");
  const [editVolume, setEditVolume] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Manage documents dialog state
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);
  const [docsVehicle, setDocsVehicle] = useState<VehicleWithDetails | null>(null);
  const [docReplacements, setDocReplacements] = useState<Partial<Record<VehicleDocType, File>>>({});
  const [docExpiryEdits, setDocExpiryEdits] = useState<Partial<Record<VehicleDocType, string>>>({});
  const [savingDocs, setSavingDocs] = useState(false);

  // --- Add Vehicle ---

  function resetAddForm() {
    setRegNumber("");
    setVehicleType("auto");
    setCapacity(String(VEHICLE_TYPE_DETAILS.auto.capacity));
    setVolumeCapacity(String(VEHICLE_TYPE_DETAILS.auto.volume_m3));
    setDocFiles({});
    setDocExpiry({});
    setOcrProgress(null);
  }

  function openAddDialog() {
    resetAddForm();
    setAddDialogOpen(true);
  }

  async function handleRcUpload(file: File) {
    setDocFiles((prev) => ({ ...prev, rc: file }));
    setOcrRunning(true);
    setOcrProgress(0);

    try {
      const regNum = await extractRegistrationNumber(file, setOcrProgress);
      if (regNum) {
        setRegNumber(regNum);
        toast.success(`Extracted: ${regNum}`);
      } else {
        toast.info("Could not extract registration number — please enter manually");
      }
    } catch {
      toast.error("OCR failed — please enter registration number manually");
    } finally {
      setOcrRunning(false);
      setOcrProgress(null);
    }
  }

  async function handleAdd() {
    if (!regNumber.trim()) {
      toast.error("Registration number is required");
      return;
    }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: vehicle, error: vehicleError } = await supabase
      .from("vehicles")
      .insert({
        created_by: user!.id,
        registration_number: regNumber.trim().toUpperCase(),
        vehicle_type: vehicleType,
        capacity_kg: Number(capacity) || 500,
        volume_capacity_m3: Number(volumeCapacity) || null,
      })
      .select()
      .single();

    if (vehicleError) {
      if (vehicleError.code === "23505") {
        toast.error("A vehicle with this registration number already exists");
      } else {
        toast.error("Failed to add vehicle");
        console.error(vehicleError);
      }
      setSaving(false);
      return;
    }

    const vehicleId = (vehicle as Vehicle).id;

    const docEntries = Object.entries(docFiles) as [VehicleDocType, File][];
    for (const [docType, file] of docEntries) {
      const ext = file.name.split(".").pop() || "pdf";
      const filePath = `${vehicleId}/${docType}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("vehicle-docs")
        .upload(filePath, file);

      if (uploadError) {
        console.error(`Failed to upload ${docType}:`, uploadError);
        toast.error(`Failed to upload ${VEHICLE_DOC_LABELS[docType]}`);
        continue;
      }

      await supabase.from("vehicle_documents").insert({
        vehicle_id: vehicleId,
        doc_type: docType,
        file_path: filePath,
        uploaded_by: user?.id,
        expires_at: docExpiry[docType] || null,
      });
    }

    toast.success("Vehicle added successfully");
    setAddDialogOpen(false);
    setSaving(false);
    fetchVehicles();
  }

  // --- Edit Vehicle ---

  function openEditDialog(vehicle: VehicleWithDetails) {
    setEditingVehicle(vehicle);
    setEditVehicleType(vehicle.vehicle_type);
    setEditCapacity(String(vehicle.capacity_kg));
    setEditVolume(String(vehicle.volume_capacity_m3 ?? ""));
    setEditDialogOpen(true);
  }

  async function handleEditVehicle() {
    if (!editingVehicle) return;
    setSavingEdit(true);

    const { error } = await supabase
      .from("vehicles")
      .update({
        vehicle_type: editVehicleType,
        capacity_kg: Number(editCapacity) || editingVehicle.capacity_kg,
        volume_capacity_m3: editVolume ? Number(editVolume) : null,
      })
      .eq("id", editingVehicle.id);

    if (error) {
      toast.error("Failed to update vehicle");
      console.error(error);
    } else {
      toast.success("Vehicle updated");
      setEditDialogOpen(false);
      fetchVehicles();
    }
    setSavingEdit(false);
  }

  // --- Manage Documents ---

  function openDocsDialog(vehicle: VehicleWithDetails) {
    setDocsVehicle(vehicle);
    setDocReplacements({});
    // Pre-fill existing expiry dates
    const expiries: Partial<Record<VehicleDocType, string>> = {};
    for (const doc of vehicle.vehicle_documents ?? []) {
      if (doc.expires_at) {
        expiries[doc.doc_type] = doc.expires_at.split("T")[0];
      }
    }
    setDocExpiryEdits(expiries);
    setDocsDialogOpen(true);
  }

  async function downloadDoc(filePath: string) {
    const { data, error } = await supabase.storage
      .from("vehicle-docs")
      .createSignedUrl(filePath, 60);

    if (error || !data?.signedUrl) {
      toast.error("Failed to get download link");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  async function handleSaveDocs() {
    if (!docsVehicle) return;

    const hasFileChanges = Object.keys(docReplacements).length > 0;
    const hasExpiryChanges = Object.entries(docExpiryEdits).some(([docType, val]) => {
      const existing = docsVehicle.vehicle_documents?.find((d) => d.doc_type === docType);
      return val !== (existing?.expires_at?.split("T")[0] ?? "");
    });

    if (!hasFileChanges && !hasExpiryChanges) {
      toast.info("No changes to save");
      return;
    }

    setSavingDocs(true);
    const { data: { user } } = await supabase.auth.getUser();

    // Process file replacements
    for (const [docType, file] of Object.entries(docReplacements) as [VehicleDocType, File][]) {
      const ext = file.name.split(".").pop() || "pdf";
      const filePath = `${docsVehicle.id}/${docType}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("vehicle-docs")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error(`Failed to upload ${docType}:`, uploadError);
        toast.error(`Failed to upload ${VEHICLE_DOC_LABELS[docType]}`);
        continue;
      }

      await supabase
        .from("vehicle_documents")
        .upsert(
          {
            vehicle_id: docsVehicle.id,
            doc_type: docType,
            file_path: filePath,
            uploaded_by: user?.id,
            expires_at: docExpiryEdits[docType] || null,
          },
          { onConflict: "vehicle_id,doc_type" }
        );
    }

    // Process expiry-only changes (no new file)
    for (const [docType, val] of Object.entries(docExpiryEdits) as [VehicleDocType, string][]) {
      if (docReplacements[docType]) continue; // already handled above
      const existing = docsVehicle.vehicle_documents?.find((d) => d.doc_type === docType);
      if (!existing) continue;
      if (val === (existing.expires_at?.split("T")[0] ?? "")) continue;

      await supabase
        .from("vehicle_documents")
        .update({ expires_at: val || null })
        .eq("id", existing.id);
    }

    toast.success("Documents updated");
    setDocsDialogOpen(false);
    setSavingDocs(false);
    fetchVehicles();
  }

  // --- Toggle Active ---

  async function toggleActive(vehicle: VehicleWithDetails) {
    const { error } = await supabase
      .from("vehicles")
      .update({ is_active: !vehicle.is_active })
      .eq("id", vehicle.id);

    if (error) {
      toast.error("Failed to update vehicle");
      return;
    }

    toast.success(vehicle.is_active ? "Vehicle deactivated" : "Vehicle activated");
    fetchVehicles();
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" /> Add Vehicle
        </Button>
      </div>

      {vehicles.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Truck}
              title="No vehicles registered"
              description="Add the first vehicle to get started."
              action={
                <Button onClick={openAddDialog}>
                  <Plus className="mr-2 h-4 w-4" /> Add Vehicle
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
                  <TableHead>Registration</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Capacity (kg)</TableHead>
                  <TableHead>Drivers</TableHead>
                  <TableHead>Docs</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((vehicle) => {
                  const docCount = vehicle.vehicle_documents?.length ?? 0;
                  const driverNames = vehicle.vehicle_drivers
                    ?.map((vd) => vd.drivers.name)
                    .join(", ");
                  return (
                    <TableRow key={vehicle.id}>
                      <TableCell className="font-medium font-mono">
                        {vehicle.registration_number}
                      </TableCell>
                      <TableCell>
                        {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]}
                      </TableCell>
                      <TableCell>{vehicle.capacity_kg}</TableCell>
                      <TableCell>
                        {driverNames ? (
                          <span className="text-sm">{driverNames}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {docCount}/{DOC_TYPES.length}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            vehicle.is_active
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }
                        >
                          {vehicle.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(vehicle)}
                            title="Edit vehicle"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDocsDialog(vehicle)}
                            title="Manage documents"
                          >
                            <FileText className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleActive(vehicle)}
                            title={vehicle.is_active ? "Deactivate" : "Activate"}
                          >
                            {vehicle.is_active ? (
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

      {/* Add Vehicle Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Vehicle</DialogTitle>
            <DialogDescription>
              Upload the RC to auto-fill registration number, then add vehicle details and documents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* RC Upload + OCR */}
            <div className="space-y-2">
              <Label>Registration Certificate (RC)</Label>
              <div className="flex items-center gap-3">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-4 py-3 text-sm text-muted-foreground hover:border-gray-400 transition-colors">
                    <Upload className="h-4 w-4" />
                    {docFiles.rc ? docFiles.rc.name : "Choose RC image or PDF..."}
                  </div>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleRcUpload(file);
                    }}
                  />
                </label>
              </div>
              {ocrRunning && ocrProgress !== null && (
                <div className="space-y-1">
                  <Progress value={ocrProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground">Reading registration number... {ocrProgress}%</p>
                </div>
              )}
            </div>

            {/* Vehicle Details */}
            <div className="space-y-2">
              <Label htmlFor="regNumber">Registration Number</Label>
              <Input
                id="regNumber"
                value={regNumber}
                onChange={(e) => setRegNumber(e.target.value)}
                placeholder="e.g. KA01AB1234"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Vehicle Type</Label>
                <Select
                  value={vehicleType}
                  onValueChange={(v) => {
                    const t = v as VehicleType;
                    setVehicleType(t);
                    setCapacity(String(VEHICLE_TYPE_DETAILS[t].capacity));
                    setVolumeCapacity(String(VEHICLE_TYPE_DETAILS[t].volume_m3));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((type) => (
                      <SelectItem key={type} value={type}>
                        {VEHICLE_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  e.g. {VEHICLE_TYPE_DETAILS[vehicleType].examples}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity (kg)</Label>
                <Input
                  id="capacity"
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  min="50"
                  max="15000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="volumeCapacity">Volume (m³)</Label>
                <Input
                  id="volumeCapacity"
                  type="number"
                  value={volumeCapacity}
                  onChange={(e) => setVolumeCapacity(e.target.value)}
                  min="0.1"
                  max="50"
                  step="0.1"
                />
              </div>
            </div>

            {/* Additional Documents */}
            <div className="space-y-3">
              <Label className="text-base">Additional Documents</Label>
              {DOC_TYPES.filter((dt) => dt !== "rc").map((docType) => {
                const hasExpiry = DOC_TYPES_WITH_EXPIRY.includes(docType);
                return (
                  <div key={docType} className="flex items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-sm font-normal text-muted-foreground">
                        {VEHICLE_DOC_LABELS[docType]}
                      </Label>
                      <label className="block cursor-pointer">
                        <div className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-muted-foreground hover:border-gray-400 transition-colors">
                          <Upload className="h-3 w-3" />
                          {docFiles[docType] ? docFiles[docType]!.name : "Choose file..."}
                        </div>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setDocFiles((prev) => ({ ...prev, [docType]: file }));
                          }}
                        />
                      </label>
                    </div>
                    {hasExpiry && (
                      <div className="w-40 space-y-1">
                        <Label className="text-sm font-normal text-muted-foreground">Expiry</Label>
                        <Input
                          type="date"
                          value={docExpiry[docType] || ""}
                          onChange={(e) =>
                            setDocExpiry((prev) => ({ ...prev, [docType]: e.target.value }))
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={saving || ocrRunning}>
              {saving ? "Adding..." : "Add Vehicle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Vehicle Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Vehicle</DialogTitle>
            <DialogDescription>
              Update vehicle details for {editingVehicle?.registration_number}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Registration Number</Label>
              <Input value={editingVehicle?.registration_number ?? ""} disabled className="font-mono" />
            </div>

            <div className="space-y-2">
              <Label>Vehicle Type</Label>
              <Select
                value={editVehicleType}
                onValueChange={(v) => {
                  const t = v as VehicleType;
                  setEditVehicleType(t);
                  setEditCapacity(String(VEHICLE_TYPE_DETAILS[t].capacity));
                  setEditVolume(String(VEHICLE_TYPE_DETAILS[t].volume_m3));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {VEHICLE_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Capacity (kg)</Label>
                <Input
                  type="number"
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(e.target.value)}
                  min="50"
                  max="15000"
                />
              </div>
              <div className="space-y-2">
                <Label>Volume (m³)</Label>
                <Input
                  type="number"
                  value={editVolume}
                  onChange={(e) => setEditVolume(e.target.value)}
                  min="0.1"
                  max="50"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditVehicle} disabled={savingEdit}>
              {savingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Documents Dialog */}
      <Dialog open={docsDialogOpen} onOpenChange={setDocsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Manage Documents — {docsVehicle?.registration_number}
            </DialogTitle>
            <DialogDescription>
              View, download, or replace vehicle documents
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {DOC_TYPES.map((docType) => {
              const doc = docsVehicle?.vehicle_documents?.find(
                (d) => d.doc_type === docType
              );
              const hasExpiry = DOC_TYPES_WITH_EXPIRY.includes(docType);
              const isExpired = doc?.expires_at && new Date(doc.expires_at) < new Date();
              const replacementFile = docReplacements[docType];
              return (
                <div
                  key={docType}
                  className="rounded-md border px-4 py-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{VEHICLE_DOC_LABELS[docType]}</p>
                        {doc?.expires_at && !hasExpiry && (
                          <p className={`text-xs ${isExpired ? "text-red-600" : "text-muted-foreground"}`}>
                            {isExpired ? "Expired" : "Expires"}: {formatDateDDMMYYYY(doc.expires_at)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadDoc(doc.file_path)}
                        >
                          <Download className="mr-1 h-3 w-3" /> Download
                        </Button>
                      )}
                      {!doc && !replacementFile && (
                        <Badge variant="secondary" className="text-xs">
                          Not uploaded
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block cursor-pointer">
                        <div className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs text-muted-foreground hover:border-gray-400 transition-colors">
                          <Upload className="h-3 w-3" />
                          {replacementFile ? replacementFile.name : (doc ? "Replace file..." : "Upload file...")}
                        </div>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setDocReplacements((prev) => ({ ...prev, [docType]: file }));
                          }}
                        />
                      </label>
                    </div>
                    {hasExpiry && (
                      <div className="w-40 space-y-1">
                        <Label className="text-xs font-normal text-muted-foreground">Expiry</Label>
                        <Input
                          type="date"
                          className="text-xs"
                          value={docExpiryEdits[docType] || ""}
                          onChange={(e) =>
                            setDocExpiryEdits((prev) => ({ ...prev, [docType]: e.target.value }))
                          }
                        />
                        {docExpiryEdits[docType] && new Date(docExpiryEdits[docType]!) < new Date() && (
                          <p className="text-xs text-red-600">Expired</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDocs} disabled={savingDocs}>
              {savingDocs ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
