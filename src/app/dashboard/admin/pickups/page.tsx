"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/hooks/use-realtime";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { PICKUP_STATUS_LABELS, PICKUP_STATUS_COLORS, GREEN_WASTE_DENSITY_KG_PER_M3 } from "@/lib/constants";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Truck, Eye, CheckCircle, ShieldCheck, Plus, Camera, ImagePlus, X } from "lucide-react";
import Link from "next/link";
import type { PickupStatus } from "@/types";
import { toast } from "sonner";

const MAX_PHOTOS = 3;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      const maxDim = 1920;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.8;
      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Compression failed"));
            if (blob.size > MAX_FILE_SIZE && quality > 0.2) {
              quality -= 0.1;
              tryCompress();
            } else {
              resolve(blob);
            }
          },
          "image/jpeg",
          quality
        );
      };
      tryCompress();
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

interface PickupWithOrg {
  id: string;
  pickup_number: string | null;
  status: PickupStatus;
  scheduled_date: string;
  scheduled_slot: string | null;
  estimated_weight_kg: number | null;
  estimated_volume_m3: number | null;
  vehicle_id: string | null;
  farmer_id: string | null;
  waste_photo_urls: string[] | null;
  organizations: { name: string } | null;
  pickup_trips: { count: number }[] | null;
  job_pickups: { jobs: { job_number: string } | null }[] | null;
}

export default function AdminPickupsPage() {
  const supabase = createClient();
  const [pickups, setPickups] = useState<PickupWithOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingDeliveredId, setMarkingDeliveredId] = useState<string | null>(null);
  const [markingProcessedId, setMarkingProcessedId] = useState<string | null>(null);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifyingPickup, setVerifyingPickup] = useState<PickupWithOrg | null>(null);
  const [verifyWeight, setVerifyWeight] = useState("");
  const [verifyVolume, setVerifyVolume] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Schedule pickup dialog state
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [allOrgs, setAllOrgs] = useState<{ id: string; name: string }[]>([]);
  const [scheduleOrgId, setScheduleOrgId] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleSlot, setScheduleSlot] = useState("morning");
  const [scheduleLoadingHelper, setScheduleLoadingHelper] = useState(false);
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [schedulePhotos, setSchedulePhotos] = useState<{ file: File; preview: string }[]>([]);
  const [scheduling, setScheduling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [minDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });

  useRealtime({
    table: "pickups",
    event: "UPDATE",
    channelName: "admin-pickups-all",
    onData: (payload) => {
      const updated = payload.new as Record<string, unknown>;
      setPickups((prev) =>
        prev.map((p) =>
          p.id === updated.id
            ? {
                ...p,
                status: updated.status as PickupStatus,
                vehicle_id: (updated.vehicle_id as string) ?? p.vehicle_id,
                farmer_id: (updated.farmer_id as string) ?? p.farmer_id,
                estimated_weight_kg: (updated.estimated_weight_kg as number) ?? p.estimated_weight_kg,
                estimated_volume_m3: (updated.estimated_volume_m3 as number) ?? p.estimated_volume_m3,
                scheduled_date: (updated.scheduled_date as string) ?? p.scheduled_date,
                scheduled_slot: (updated.scheduled_slot as string) ?? p.scheduled_slot,
              }
            : p
        )
      );
    },
  });

  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase
        .from("pickups")
        .select("id, pickup_number, status, scheduled_date, scheduled_slot, estimated_weight_kg, estimated_volume_m3, vehicle_id, farmer_id, waste_photo_urls, organizations(name), pickup_trips(count), job_pickups(jobs(job_number))")
        .order("scheduled_date", { ascending: false });

      if (data) setPickups(data as unknown as PickupWithOrg[]);
      setLoading(false);
    }
    fetchData();
  }, [supabase]);

  async function handleMarkDelivered(pickupId: string) {
    setMarkingDeliveredId(pickupId);
    const { error } = await supabase
      .from("pickups")
      .update({ status: "delivered" })
      .eq("id", pickupId);

    if (error) {
      toast.error("Failed to mark as delivered");
      setMarkingDeliveredId(null);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("pickup_events").insert({
        pickup_id: pickupId,
        status: "delivered",
        changed_by: user.id,
        notes: "Marked delivered by admin after farmer verification",
      });
    }

    setPickups((prev) =>
      prev.map((p) => (p.id === pickupId ? { ...p, status: "delivered" } : p))
    );
    toast.success("Pickup marked as delivered");
    setMarkingDeliveredId(null);
  }

  async function handleMarkProcessed(pickupId: string) {
    setMarkingProcessedId(pickupId);
    const { error } = await supabase
      .from("pickups")
      .update({ status: "processed" })
      .eq("id", pickupId);

    if (error) {
      toast.error("Failed to mark as processed");
      setMarkingProcessedId(null);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("pickup_events").insert({
        pickup_id: pickupId,
        status: "processed",
        changed_by: user.id,
        notes: "Marked processed by admin",
      });
    }

    setPickups((prev) =>
      prev.map((p) => (p.id === pickupId ? { ...p, status: "processed" } : p))
    );
    toast.success("Pickup marked as processed");
    setMarkingProcessedId(null);
  }

  function openVerifyDialog(pickup: PickupWithOrg) {
    setVerifyingPickup(pickup);
    setVerifyWeight(pickup.estimated_weight_kg?.toString() ?? "");
    setVerifyVolume(pickup.estimated_volume_m3?.toString() ?? "");
    setVerifyDialogOpen(true);
  }

  async function handleVerify() {
    if (!verifyingPickup) return;
    setVerifying(true);

    const weight = verifyWeight ? Number(verifyWeight) : null;
    const volume = verifyVolume ? Number(verifyVolume) : null;

    const { error } = await supabase
      .from("pickups")
      .update({
        status: "verified",
        estimated_weight_kg: weight,
        estimated_volume_m3: volume,
      })
      .eq("id", verifyingPickup.id);

    if (error) {
      toast.error("Failed to verify pickup");
      setVerifying(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("pickup_events").insert({
        pickup_id: verifyingPickup.id,
        status: "verified",
        changed_by: user.id,
        notes: `Verified by admin — weight: ${weight ?? "N/A"} kg, volume: ${volume ?? "N/A"} m³`,
      });
    }

    setPickups((prev) =>
      prev.map((p) =>
        p.id === verifyingPickup.id
          ? { ...p, status: "verified" as PickupStatus, estimated_weight_kg: weight, estimated_volume_m3: volume }
          : p
      )
    );
    toast.success("Pickup verified");
    setVerifying(false);
    setVerifyDialogOpen(false);
  }

  async function openScheduleDialog() {
    setScheduleDialogOpen(true);
    if (allOrgs.length === 0) {
      const { data } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");
      if (data) setAllOrgs(data);
    }
  }

  function handleSchedulePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const remaining = MAX_PHOTOS - schedulePhotos.length;
    const selected = Array.from(files).slice(0, remaining);
    const newPhotos = selected.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setSchedulePhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function removeSchedulePhoto(index: number) {
    setSchedulePhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSchedulePickup() {
    if (!scheduleOrgId) {
      toast.error("Please select an organization");
      return;
    }
    if (!scheduleDate || scheduleDate < minDate) {
      toast.error("Pickup date must be from tomorrow onwards");
      return;
    }
    if (schedulePhotos.length === 0) {
      toast.error("Please add at least one waste photo");
      return;
    }

    setScheduling(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Unable to verify admin user");
      setScheduling(false);
      return;
    }

    // Upload compressed photos
    const photoUrls: string[] = [];
    for (const { file } of schedulePhotos) {
      try {
        const compressed = await compressImage(file);
        const fileName = `${scheduleOrgId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("pickup-photos")
          .upload(fileName, compressed, { contentType: "image/jpeg" });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage
          .from("pickup-photos")
          .getPublicUrl(fileName);
        photoUrls.push(urlData.publicUrl);
      } catch {
        toast.error("Failed to upload a photo, skipping...");
      }
    }

    const { data, error } = await supabase
      .from("pickups")
      .insert({
        organization_id: scheduleOrgId,
        requested_by: user.id,
        scheduled_date: scheduleDate,
        scheduled_slot: scheduleSlot,
        notes: scheduleNotes || null,
        loading_helper_required: scheduleLoadingHelper,
        waste_photo_urls: photoUrls,
      })
      .select("id, pickup_number, status, scheduled_date, scheduled_slot, estimated_weight_kg, estimated_volume_m3, vehicle_id, farmer_id, waste_photo_urls, organizations(name), pickup_trips(count), job_pickups(jobs(job_number))")
      .single();

    if (error) {
      toast.error("Failed to schedule pickup");
      setScheduling(false);
      return;
    }

    // Insert pickup event
    await supabase.from("pickup_events").insert({
      pickup_id: data.id,
      status: "requested",
      changed_by: user.id,
      notes: "Scheduled by admin",
    });

    // Prepend to list
    setPickups((prev) => [data as unknown as PickupWithOrg, ...prev]);

    // Clean up
    schedulePhotos.forEach((p) => URL.revokeObjectURL(p.preview));
    toast.success("Pickup scheduled successfully");
    setScheduleDialogOpen(false);
    setScheduling(false);
    setScheduleOrgId("");
    setScheduleDate("");
    setScheduleSlot("morning");
    setScheduleLoadingHelper(false);
    setScheduleNotes("");
    setSchedulePhotos([]);
  }

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Pickups"
        description="Monitor pickups and track status"
        action={
          <Button onClick={openScheduleDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Schedule Pickup
          </Button>
        }
      />

      {pickups.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Truck}
              title="No pickups"
              description="No pickups have been scheduled yet."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pickup #</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Est. Weight</TableHead>
                  <TableHead>Trips</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pickups.map((pickup) => {
                  const jobNumbers = pickup.job_pickups
                    ?.map((jp) => jp.jobs?.job_number)
                    .filter(Boolean) as string[] | undefined;

                  return (
                    <TableRow key={pickup.id}>
                      <TableCell className="font-medium">
                        {pickup.pickup_number}
                      </TableCell>
                      <TableCell>
                        {pickup.organizations?.name || "—"}
                      </TableCell>
                      <TableCell>
                        {new Date(pickup.scheduled_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {pickup.estimated_weight_kg
                          ? `${pickup.estimated_weight_kg} kg`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {pickup.pickup_trips?.[0]?.count ?? 0}
                      </TableCell>
                      <TableCell>
                        {jobNumbers && jobNumbers.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {jobNumbers.map((jn) => (
                              <Link
                                key={jn}
                                href="/dashboard/admin/jobs"
                                className="text-sm text-blue-600 hover:underline"
                              >
                                {jn}
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={PICKUP_STATUS_COLORS[pickup.status]}
                        >
                          {PICKUP_STATUS_LABELS[pickup.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {pickup.status === "requested" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openVerifyDialog(pickup)}
                            >
                              <ShieldCheck className="mr-1 h-3 w-3" />
                              Verify
                            </Button>
                          )}
                          {pickup.status === "picked_up" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkDelivered(pickup.id)}
                              disabled={markingDeliveredId === pickup.id}
                            >
                              <CheckCircle className="mr-1 h-3 w-3" />
                              {markingDeliveredId === pickup.id ? "..." : "Mark Delivered"}
                            </Button>
                          )}
                          {pickup.status === "delivered" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkProcessed(pickup.id)}
                              disabled={markingProcessedId === pickup.id}
                            >
                              <CheckCircle className="mr-1 h-3 w-3" />
                              {markingProcessedId === pickup.id ? "..." : "Mark Processed"}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/dashboard/admin/pickups/${pickup.id}`}>
                              <Eye className="h-3 w-3" />
                            </Link>
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

      {/* Schedule Pickup Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Schedule Pickup</DialogTitle>
            <DialogDescription>
              Schedule a waste pickup on behalf of an organization.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="schedOrg">Organization <span className="text-destructive">*</span></Label>
              <Select value={scheduleOrgId} onValueChange={setScheduleOrgId}>
                <SelectTrigger id="schedOrg">
                  <SelectValue placeholder="Select an organization" />
                </SelectTrigger>
                <SelectContent>
                  {allOrgs.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="schedDate">Pickup Date <span className="text-destructive">*</span></Label>
                <Input
                  id="schedDate"
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && val < minDate) {
                      toast.error("Pickup date must be from tomorrow onwards");
                      setScheduleDate(minDate);
                    } else {
                      setScheduleDate(val);
                    }
                  }}
                  min={minDate}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="schedSlot">Time Slot</Label>
                <Select value={scheduleSlot} onValueChange={setScheduleSlot}>
                  <SelectTrigger id="schedSlot">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning (6am - 12pm)</SelectItem>
                    <SelectItem value="afternoon">Afternoon (12pm - 4pm)</SelectItem>
                    <SelectItem value="evening">Evening (4pm - 8pm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="schedHelper"
                checked={scheduleLoadingHelper}
                onCheckedChange={(checked) => setScheduleLoadingHelper(checked === true)}
              />
              <Label htmlFor="schedHelper" className="cursor-pointer">
                Loading helper required
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Waste Photos (1-{MAX_PHOTOS}, required) <span className="text-destructive">*</span></Label>
              <div className="flex gap-3 flex-wrap">
                {schedulePhotos.map((photo, i) => (
                  <div key={i} className="relative h-24 w-24 rounded-md overflow-hidden border">
                    <img
                      src={photo.preview}
                      alt={`Waste photo ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeSchedulePhoto(i)}
                      className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {schedulePhotos.length < MAX_PHOTOS && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    >
                      <Camera className="h-5 w-5" />
                      <span className="text-[10px]">Camera</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    >
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-[10px]">Gallery</span>
                    </button>
                  </div>
                )}
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleSchedulePhotoSelect}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleSchedulePhotoSelect}
              />
              <p className="text-xs text-muted-foreground">
                Photos will be compressed automatically (max 2MB each)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedNotes">Notes (optional)</Label>
              <Textarea
                id="schedNotes"
                value={scheduleNotes}
                onChange={(e) => setScheduleNotes(e.target.value)}
                placeholder="Any special instructions..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)} disabled={scheduling}>
              Cancel
            </Button>
            <Button onClick={handleSchedulePickup} disabled={scheduling}>
              {scheduling ? "Scheduling..." : "Schedule Pickup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify Pickup Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Verify Pickup</DialogTitle>
            <DialogDescription>
              Review and confirm the estimated weight and volume for {verifyingPickup?.pickup_number}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              Organization: <strong>{verifyingPickup?.organizations?.name ?? "—"}</strong>
            </div>
            {verifyingPickup?.waste_photo_urls && verifyingPickup.waste_photo_urls.length > 0 && (
              <div className="space-y-2">
                <Label>Waste Photos</Label>
                <div className="flex gap-2 overflow-x-auto">
                  {verifyingPickup.waste_photo_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={url}
                        alt={`Waste photo ${i + 1}`}
                        className="h-32 w-32 rounded-md border object-cover hover:opacity-80 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="verifyWeight">Estimated Weight (kg)</Label>
              <Input
                id="verifyWeight"
                type="number"
                min="0"
                value={verifyWeight}
                onChange={(e) => {
                  const w = e.target.value;
                  setVerifyWeight(w);
                  if (w) {
                    setVerifyVolume(
                      (Number(w) / GREEN_WASTE_DENSITY_KG_PER_M3).toFixed(2)
                    );
                  }
                }}
                placeholder="Enter weight in kg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="verifyVolume">Estimated Volume (m³)</Label>
              <Input
                id="verifyVolume"
                type="number"
                min="0"
                step="0.1"
                value={verifyVolume}
                onChange={(e) => {
                  const v = e.target.value;
                  setVerifyVolume(v);
                  if (v) {
                    setVerifyWeight(
                      Math.round(Number(v) * GREEN_WASTE_DENSITY_KG_PER_M3).toString()
                    );
                  }
                }}
                placeholder="Enter volume in m³"
              />
              <p className="text-xs text-muted-foreground">
                Auto-calculated at {GREEN_WASTE_DENSITY_KG_PER_M3} kg/m³ — editable
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleVerify} disabled={verifying}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {verifying ? "Verifying..." : "Verify Pickup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
