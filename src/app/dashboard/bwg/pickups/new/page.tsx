"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useOrganization } from "@/hooks/use-organization";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { PageHeader } from "@/components/shared/page-header";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { Camera, CreditCard, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { selectFifoPrepaidPackage } from "@/lib/prepaid-credits";

const MAX_PHOTOS = 3;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      // Scale down if larger than 1920px on any side
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
      // Start at quality 0.8, reduce if still too large
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

export default function SchedulePickupPage() {
  const { user, orgId: memberOrgId, loading: orgLoading, supabase } = useOrganization();
  const router = useRouter();

  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledSlot, setScheduledSlot] = useState("morning");
  const [notes, setNotes] = useState("");
  const [entryInstructions, setEntryInstructions] = useState("");
  const [loadingHelper, setLoadingHelper] = useState(false);
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [prepaidPackage, setPrepaidPackage] = useState<{
    id: string;
    pickup_count: number;
    used_count: number;
    expires_at: string | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [vehicleAvailability, setVehicleAvailability] = useState<{
    status: "available" | "limited" | "fully_booked" | null;
    message: string;
  }>({ status: null, message: "" });
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [minDate] = useState(() => {
    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    return dayAfterTomorrow.toISOString().split("T")[0];
  });

  useEffect(() => {
    if (orgLoading || !user) return;
    if (!memberOrgId) {
      setLoading(false);
      return;
    }
    async function fetchOrg() {
      setOrgId(memberOrgId);

      // FIFO: earliest-expiring approved package with remaining credits
      const { data: prepaidRows } = await supabase
        .from("prepaid_packages")
        .select("id, pickup_count, used_count, expires_at, status")
        .eq("organization_id", memberOrgId!)
        .eq("status", "approved")
        .gt("expires_at", new Date().toISOString());

      const fifoPackage = prepaidRows
        ? selectFifoPrepaidPackage(prepaidRows)
        : null;

      if (fifoPackage) {
        setPrepaidPackage({
          id: fifoPackage.id,
          pickup_count: fifoPackage.pickup_count,
          used_count: fifoPackage.used_count,
          expires_at: fifoPackage.expires_at,
        });
      }
      setLoading(false);
    }
    fetchOrg();
  }, [user, memberOrgId, orgLoading, supabase]);

  async function checkVehicleAvailability(date: string) {
    if (!date) {
      setVehicleAvailability({ status: null, message: "" });
      return;
    }
    setCheckingAvailability(true);
    try {
      // Count total vehicles
      const { count: totalVehicles } = await supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true });

      // Count vehicles already assigned to pickups on this date
      const { count: busyVehicles } = await supabase
        .from("pickups")
        .select("vehicle_id", { count: "exact", head: true })
        .eq("scheduled_date", date)
        .not("vehicle_id", "is", null)
        .not("status", "in", '("cancelled","arrived_processor","accepted","processed")');

      const total = totalVehicles ?? 0;
      const busy = busyVehicles ?? 0;

      if (total === 0 || busy === 0) {
        setVehicleAvailability({ status: "available", message: "Vehicles available" });
      } else if (busy >= total) {
        setVehicleAvailability({ status: "fully_booked", message: "Fully booked" });
      } else {
        setVehicleAvailability({ status: "limited", message: "Limited availability" });
      }
    } catch {
      setVehicleAvailability({ status: null, message: "" });
    }
    setCheckingAvailability(false);
  }

  if (orgLoading || loading) return <DashboardSkeleton />;

  if (!orgId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Schedule Pickup" />
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              You need to set up your organization first before scheduling pickups.
            </p>
            <Button
              className="mt-4"
              onClick={() => router.push("/dashboard/bwg/organization")}
            >
              Set Up Organization
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const remaining = MAX_PHOTOS - photos.length;
    const selected = Array.from(files).slice(0, remaining);
    const newPhotos = selected.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !orgId) return;
    if (!prepaidPackage) {
      toast.error(
        "Your organization has no prepaid pickup credits. Please contact your admin to assign a prepaid package."
      );
      return;
    }
    if (scheduledDate < minDate) {
      toast.error("Pickup date must be at least 2 days from today");
      return;
    }
    if (photos.length < 2) {
      toast.error("Please add at least 2 photos of the waste");
      return;
    }
    setSubmitting(true);

    // Upload photos
    const photoUrls: string[] = [];
    for (const { file } of photos) {
      try {
        const compressed = await compressImage(file);
        const fileName = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
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

    // Combine notes and entry instructions
    const combinedNotes = [
      notes,
      entryInstructions ? `[Entry Instructions] ${entryInstructions}` : "",
    ].filter(Boolean).join("\n") || null;

    const { data, error } = await supabase
      .from("pickups")
      .insert({
        organization_id: orgId,
        requested_by: user.id,
        status: "requested",
        scheduled_date: scheduledDate,
        scheduled_slot: scheduledSlot,
        notes: combinedNotes,
        loading_helper_required: loadingHelper,
        waste_photo_urls: photoUrls,
        prepaid_package_id: prepaidPackage?.id || null,
      })
      .select()
      .single();

    if (error) {
      toast.error(
        error.message?.includes("Insufficient prepaid credits")
          ? "Your organization has no prepaid pickup credits. Please contact your admin to assign a prepaid package."
          : "Failed to schedule pickup"
      );
      setSubmitting(false);
      return;
    }

    // Insert initial pickup event
    await supabase.from("pickup_events").insert({
      pickup_id: data.id,
      status: "requested",
      changed_by: user.id,
      notes: "Pickup scheduled",
    });

    // Clean up photo previews
    photos.forEach((p) => URL.revokeObjectURL(p.preview));

    toast.success("Pickup scheduled!");
    router.push("/dashboard/bwg/pickups");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule Pickup"
        description="Request a new waste pickup for your organization"
      />
      {prepaidPackage ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-green-600 shrink-0" />
          <p className="text-sm text-green-800">
            <strong>{prepaidPackage.pickup_count - prepaidPackage.used_count}</strong> remaining credits. This pickup will use 1 pickup credit.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-800">
            Your organization has no prepaid pickup credits. Please contact your admin to assign a prepaid package.
          </p>
        </div>
      )}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date">Pickup Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && val < minDate) {
                      toast.error("Pickup date must be at least 2 days from today");
                      setScheduledDate(minDate);
                      checkVehicleAvailability(minDate);
                    } else {
                      setScheduledDate(val);
                      checkVehicleAvailability(val);
                    }
                  }}
                  min={minDate}
                  required
                  className={
                    vehicleAvailability.status === "available"
                      ? "border-green-500 focus-visible:ring-green-500"
                      : vehicleAvailability.status === "limited"
                      ? "border-amber-500 focus-visible:ring-amber-500"
                      : vehicleAvailability.status === "fully_booked"
                      ? "border-red-500 focus-visible:ring-red-500"
                      : ""
                  }
                />
                {checkingAvailability && (
                  <p className="text-xs text-muted-foreground">Checking availability...</p>
                )}
                {!checkingAvailability && vehicleAvailability.status && (
                  <p
                    className={`text-xs font-medium ${
                      vehicleAvailability.status === "available"
                        ? "text-green-600"
                        : vehicleAvailability.status === "limited"
                        ? "text-amber-600"
                        : "text-red-600"
                    }`}
                  >
                    {vehicleAvailability.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="slot">Time Slot</Label>
                <Select value={scheduledSlot} onValueChange={setScheduledSlot}>
                  <SelectTrigger>
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
                id="loadingHelper"
                checked={loadingHelper}
                onCheckedChange={(checked) =>
                  setLoadingHelper(checked === true)
                }
              />
              <Label htmlFor="loadingHelper" className="cursor-pointer">
                Loading helper required
              </Label>
            </div>
            <div className="space-y-2">
              <Label>Waste Photos (at least 2, up to {MAX_PHOTOS}) <span className="text-destructive">*</span></Label>
              <div className="flex gap-3 flex-wrap">
                {photos.map((photo, i) => (
                  <div
                    key={i}
                    className="relative h-24 w-24 rounded-md overflow-hidden border"
                  >
                    <img
                      src={photo.preview}
                      alt={`Waste photo ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
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
                onChange={handlePhotoSelect}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoSelect}
              />
              <p className="text-xs text-muted-foreground">
                Take photos with your camera or pick from gallery (max 2MB each)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entryInstructions">Entry Instructions (optional)</Label>
              <Textarea
                id="entryInstructions"
                value={entryInstructions}
                onChange={(e) => setEntryInstructions(e.target.value)}
                placeholder="Which gate to use, security process, contact person..."
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                These instructions will be shared with the collector via WhatsApp.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any other special instructions..."
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting || !prepaidPackage}>
                {submitting ? "Scheduling..." : "Schedule Pickup"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/bwg/pickups")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
