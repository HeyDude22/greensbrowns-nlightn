"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Truck, Eye, CheckCircle, ShieldCheck, Plus, Camera, ImagePlus, X, Sparkles, Loader2, CheckCheck, List, Map, HelpCircle, Lock, XCircle } from "lucide-react";
import Link from "next/link";
import type { PickupStatus, VehicleType } from "@/types";
import { toast } from "sonner";
import { formatDateDDMMYYYY } from "@/lib/utils";
import {
  optimizeJobs,
  type OptimizerPickup,
  type OptimizerFarmer,
  type OptimizerRate,
  type OptimizerVehicle,
  type JobSuggestion,
} from "@/lib/job-optimizer";
import { createJobFromSuggestion } from "@/lib/create-job";
import { CLUSTER_COLORS, VEHICLE_TYPE_LABELS } from "@/lib/constants";
import SuggestionMap from "@/components/shared/suggestion-map-dynamic";

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
  photo_before_url: string | null;
  photo_after_url: string | null;
  organizations: { name: string } | null;
  pickup_trips: { count: number }[] | null;
  job_pickups: { jobs: { job_number: string } | null }[] | null;
}

export default function AdminPickupsPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status") as PickupStatus | null;
  const [pickups, setPickups] = useState<PickupWithOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingDeliveredId, setMarkingDeliveredId] = useState<string | null>(null);
  const [markingProcessedId, setMarkingProcessedId] = useState<string | null>(null);
  const [cancellingPickupId, setCancellingPickupId] = useState<string | null>(null);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifyingPickup, setVerifyingPickup] = useState<PickupWithOrg | null>(null);
  const [verifyWeight, setVerifyWeight] = useState("");
  const [verifyVolume, setVerifyVolume] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Suggest jobs state
  const [viewMode, setViewMode] = useState<"list" | "suggest">("list");
  const [suggestions, setSuggestions] = useState<JobSuggestion[]>([]);
  const [skippedPickups, setSkippedPickups] = useState<OptimizerPickup[]>([]);
  const [optimizing, setOptimizing] = useState(false);
  const [selectedPickupIds, setSelectedPickupIds] = useState<Set<string>>(new Set());
  const [creatingJob, setCreatingJob] = useState(false);
  const [suggestFarmers, setSuggestFarmers] = useState<{ id: string; full_name: string | null; farm_lat: number | null; farm_lng: number | null }[]>([]);
  const [suggestVehicles, setSuggestVehicles] = useState<{ id: string; registration_number: string; vehicle_type: VehicleType; capacity_kg: number; volume_capacity_m3: number | null; vehicle_drivers: { driver_id: string; drivers: { id: string; name: string } }[] }[]>([]);
  const [suggestBusyIds, setSuggestBusyIds] = useState<Set<string>>(new Set());
  const [allOptimizerPickups, setAllOptimizerPickups] = useState<OptimizerPickup[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [selectedFarmer, setSelectedFarmer] = useState("");
  const [suggestRates, setSuggestRates] = useState<OptimizerRate[]>([]);

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
    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    return dayAfterTomorrow.toISOString().split("T")[0];
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
        .select("id, pickup_number, status, scheduled_date, scheduled_slot, estimated_weight_kg, estimated_volume_m3, vehicle_id, farmer_id, waste_photo_urls, photo_before_url, photo_after_url, organizations(name), pickup_trips(count), job_pickups(jobs(job_number))")
        .order("scheduled_date", { ascending: false });

      if (data) setPickups(data as unknown as PickupWithOrg[]);
      setLoading(false);
    }
    fetchData();
  }, [supabase]);

  async function handleMarkArrivedProcessor(pickupId: string) {
    setMarkingDeliveredId(pickupId);
    const { error } = await supabase
      .from("pickups")
      .update({ status: "arrived_processor", delivered_at: new Date().toISOString() })
      .eq("id", pickupId);

    if (error) {
      toast.error("Failed to mark arrived at processor");
      setMarkingDeliveredId(null);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("pickup_events").insert({
        pickup_id: pickupId,
        status: "arrived_processor",
        changed_by: user.id,
        notes: "Marked arrived at processor by admin",
      });
    }

    setPickups((prev) =>
      prev.map((p) => (p.id === pickupId ? { ...p, status: "arrived_processor" } : p))
    );
    toast.success("Pickup marked as arrived at processor");
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

  async function handleCancelPickup(pickupId: string) {
    if (!window.confirm("Cancel this pickup request? Prepaid credits will be restored if applicable.")) {
      return;
    }

    setCancellingPickupId(pickupId);
    const { error } = await supabase
      .from("pickups")
      .update({ status: "cancelled" })
      .eq("id", pickupId);

    if (error) {
      toast.error("Failed to cancel pickup");
      setCancellingPickupId(null);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("pickup_events").insert({
        pickup_id: pickupId,
        status: "cancelled",
        changed_by: user.id,
        notes: "Cancelled by admin",
      });
    }

    setPickups((prev) =>
      prev.map((p) => (p.id === pickupId ? { ...p, status: "cancelled" } : p))
    );
    toast.success("Pickup cancelled");
    setCancellingPickupId(null);
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

  async function handleSuggestJobs() {
    setOptimizing(true);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const scheduledDate = tomorrow.toISOString().split("T")[0];

    const [pickupResult, farmerResult, rateResult, vehicleResult, busyResult] = await Promise.all([
      supabase
        .from("pickups")
        .select("id, pickup_number, estimated_weight_kg, estimated_volume_m3, scheduled_date, scheduled_slot, organizations(name, lat, lng)")
        .eq("status", "verified")
        .lte("scheduled_date", scheduledDate)
        .order("scheduled_date", { ascending: true }),
      supabase
        .from("profiles")
        .select("id, full_name, farmer_details(farm_lat, farm_lng, is_active)")
        .eq("role", "farmer"),
      supabase.from("vehicle_type_rates").select("vehicle_type, base_fare_rs, per_km_rs"),
      supabase
        .from("vehicles")
        .select("id, vehicle_type, capacity_kg, volume_capacity_m3, registration_number, vehicle_drivers(driver_id, drivers(id, name, phone, license_number))")
        .eq("is_active", true),
      supabase
        .from("jobs")
        .select("vehicle_id")
        .eq("scheduled_date", scheduledDate)
        .in("status", ["draft", "pending", "dispatched", "in_progress"]),
    ]);

    const busyIds = new Set((busyResult.data ?? []).map((j) => j.vehicle_id));
    setSuggestBusyIds(busyIds);

    const allVehiclesWithDrivers = (vehicleResult.data ?? []).filter(
      (v: Record<string, unknown>) => {
        const drivers = v.vehicle_drivers as unknown[];
        return drivers && drivers.length > 0;
      },
    ) as unknown as typeof suggestVehicles;
    setSuggestVehicles(allVehiclesWithDrivers);

    const optimizerFarmers: OptimizerFarmer[] = (farmerResult.data ?? [])
      .filter((f: Record<string, unknown>) => {
        const raw = f.farmer_details;
        const details = Array.isArray(raw) ? raw[0] : raw;
        return (details as Record<string, unknown> | null)?.is_active !== false;
      })
      .map((f: Record<string, unknown>) => {
        const raw = f.farmer_details;
        const details = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
        return {
          id: f.id as string,
          full_name: f.full_name as string | null,
          farm_lat: (details?.farm_lat as number) ?? null,
          farm_lng: (details?.farm_lng as number) ?? null,
        };
      });
    setSuggestFarmers(optimizerFarmers);

    const optimizerPickups: OptimizerPickup[] = (pickupResult.data ?? []).map(
      (p: Record<string, unknown>) => {
        const org = p.organizations as Record<string, unknown> | null;
        return {
          id: p.id as string,
          pickup_number: p.pickup_number as string,
          org_name: (org?.name as string) ?? "",
          estimated_weight_kg: p.estimated_weight_kg as number | null,
          estimated_volume_m3: p.estimated_volume_m3 as number | null,
          lat: (org?.lat as number) ?? null,
          lng: (org?.lng as number) ?? null,
        };
      },
    );
    setAllOptimizerPickups(optimizerPickups);

    const optimizerRates: OptimizerRate[] = (rateResult.data ?? []).map(
      (r: Record<string, unknown>) => ({
        vehicle_type: r.vehicle_type as VehicleType,
        base_fare_rs: r.base_fare_rs as number,
        per_km_rs: r.per_km_rs as number,
      }),
    );
    setSuggestRates(optimizerRates);

    const availableVehicles: OptimizerVehicle[] = allVehiclesWithDrivers
      .filter((v) => !busyIds.has(v.id))
      .map((v) => ({
        id: v.id,
        vehicle_type: v.vehicle_type,
        capacity_kg: v.capacity_kg,
        volume_capacity_m3: v.volume_capacity_m3,
      }));

    if (optimizerPickups.length === 0) {
      toast.warning("No verified pickups to optimize");
      setOptimizing(false);
      return;
    }

    const result = optimizeJobs(
      optimizerPickups,
      optimizerFarmers,
      optimizerRates,
      availableVehicles,
      GREEN_WASTE_DENSITY_KG_PER_M3,
    );

    setSuggestions(result.suggestions);
    setSkippedPickups(result.skippedPickups);
    setSelectedPickupIds(new Set());
    setSelectedVehicle("");
    setSelectedFarmer("");
    setViewMode("suggest");
    setOptimizing(false);
    toast.success(`${result.suggestions.length} suggestion(s) — click pickups on the map to group them into jobs`);
  }

  function togglePickupSelection(id: string) {
    setSelectedPickupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectCluster(index: number) {
    const suggestion = suggestions[index];
    if (!suggestion) return;
    setSelectedPickupIds(new Set(suggestion.pickupIds));
    setSelectedFarmer(suggestion.farmerId);
    // Auto-select a vehicle of the suggested type
    const available = suggestVehicles.filter(
      (v) => v.vehicle_type === suggestion.vehicleType && !suggestBusyIds.has(v.id),
    );
    setSelectedVehicle(available[0]?.id ?? "");
  }

  // Computed: selected pickup details
  const selectedPickupDetails = allOptimizerPickups.filter((p) => selectedPickupIds.has(p.id));
  const selectedTotalWeight = selectedPickupDetails.reduce((sum, p) => sum + (p.estimated_weight_kg ?? 0), 0);

  async function handleCreateJobFromSelection() {
    if (selectedPickupIds.size === 0 || !selectedVehicle || !selectedFarmer) {
      toast.error("Select pickups, a vehicle, and a farmer");
      return;
    }
    setCreatingJob(true);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const scheduledDate = tomorrow.toISOString().split("T")[0];

    const vehicle = suggestVehicles.find((v) => v.id === selectedVehicle);
    const driver = vehicle?.vehicle_drivers[0]?.drivers;

    const result = await createJobFromSuggestion(supabase, {
      scheduledDate,
      vehicleId: selectedVehicle,
      driverId: driver?.id ?? null,
      farmerId: selectedFarmer,
      pickupIds: Array.from(selectedPickupIds),
      status: "pending",
    });

    if ("error" in result) {
      toast.error(result.error);
      setCreatingJob(false);
      return;
    }

    toast.success(`${result.jobNumber} created with ${selectedPickupIds.size} pickup(s)`);

    // Remove assigned pickups from optimizer data and re-run suggestions
    const assignedIds = new Set(selectedPickupIds);
    setPickups((prev) => prev.map((p) => assignedIds.has(p.id) ? { ...p, status: "assigned" as PickupStatus } : p));
    const remainingPickups = allOptimizerPickups.filter((p) => !assignedIds.has(p.id));
    setAllOptimizerPickups(remainingPickups);

    // Re-run optimizer on remaining pickups
    const availableVehicles: OptimizerVehicle[] = suggestVehicles
      .filter((v) => !suggestBusyIds.has(v.id) && v.id !== selectedVehicle)
      .map((v) => ({ id: v.id, vehicle_type: v.vehicle_type, capacity_kg: v.capacity_kg, volume_capacity_m3: v.volume_capacity_m3 }));

    if (remainingPickups.length > 0 && suggestFarmers.length > 0) {
      const newResult = optimizeJobs(remainingPickups, suggestFarmers, suggestRates, availableVehicles, GREEN_WASTE_DENSITY_KG_PER_M3);
      setSuggestions(newResult.suggestions);
      setSkippedPickups(newResult.skippedPickups);
    } else {
      setSuggestions([]);
      setSkippedPickups([]);
    }

    setSuggestBusyIds((prev) => new Set([...prev, selectedVehicle]));
    setSelectedPickupIds(new Set());
    setSelectedVehicle("");
    setSelectedFarmer("");
    setCreatingJob(false);
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
      toast.error("Pickup date must be at least 2 days from today");
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
        status: "requested",
        scheduled_date: scheduleDate,
        scheduled_slot: scheduleSlot,
        notes: scheduleNotes || null,
        loading_helper_required: scheduleLoadingHelper,
        waste_photo_urls: photoUrls,
      })
      .select("id, pickup_number, status, scheduled_date, scheduled_slot, estimated_weight_kg, estimated_volume_m3, vehicle_id, farmer_id, waste_photo_urls, photo_before_url, photo_after_url, organizations(name), pickup_trips(count), job_pickups(jobs(job_number))")
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

  const filteredPickups = statusFilter
    ? pickups.filter((p) => p.status === statusFilter)
    : pickups;

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Pickups"
        description="Monitor pickups and track status"
        action={
          <div className="flex gap-2">
            {viewMode === "suggest" ? (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                      <HelpCircle className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="end" className="w-80 text-sm space-y-2">
                    <p className="font-medium">How to create jobs</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Colored dots on the map are suggested groupings</li>
                      <li><strong>Click markers</strong> on the map to select pickups, or click a suggestion row below to select a group</li>
                      <li>Mix and match — select pickups from different groups freely</li>
                      <li>Choose a <strong>vehicle</strong> and <strong>farmer</strong> in the panel that appears</li>
                      <li>Click <strong>Create Job</strong> — the job is created instantly</li>
                      <li>Remaining pickups are re-grouped automatically</li>
                    </ol>
                    <p className="text-xs text-muted-foreground pt-1">Tip: Click a colored dot in a popup to select its entire cluster.</p>
                  </PopoverContent>
                </Popover>
                <Button variant="outline" onClick={() => { setViewMode("list"); setSuggestions([]); setSelectedPickupIds(new Set()); }}>
                  <List className="mr-2 h-4 w-4" />
                  Back to List
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={handleSuggestJobs} disabled={optimizing}>
                  {optimizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Suggest Jobs
                </Button>
                <Button onClick={openScheduleDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Schedule Pickup
                </Button>
              </>
            )}
          </div>
        }
      />

      {statusFilter && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtered by:</span>
          <Badge variant="secondary" className={PICKUP_STATUS_COLORS[statusFilter]}>
            {PICKUP_STATUS_LABELS[statusFilter]}
          </Badge>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/admin/pickups">
              <X className="mr-1 h-3 w-3" />
              Clear
            </Link>
          </Button>
        </div>
      )}

      {viewMode === "suggest" ? (
        <div className="space-y-4">
          {/* Map */}
          <Card>
            <CardContent className="p-0 overflow-hidden rounded-lg">
              <SuggestionMap
                suggestions={suggestions}
                farmers={suggestFarmers}
                skippedPickups={skippedPickups}
                selectedIds={selectedPickupIds}
                onTogglePickup={togglePickupSelection}
                onSelectCluster={selectCluster}
              />
            </CardContent>
          </Card>

          {/* Selection panel */}
          {selectedPickupIds.size > 0 && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">
                    {selectedPickupIds.size} pickup{selectedPickupIds.size !== 1 ? "s" : ""} selected
                    <span className="text-muted-foreground font-normal ml-2">
                      {selectedTotalWeight > 1000
                        ? `${(selectedTotalWeight / 1000).toFixed(1)}t`
                        : `${Math.round(selectedTotalWeight)} kg`}
                    </span>
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPickupIds(new Set())}>
                    Clear
                  </Button>
                </div>

                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {selectedPickupDetails.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm py-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.pickup_number}</span>
                        <span className="text-muted-foreground">{p.org_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{p.estimated_weight_kg ?? 0} kg</span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => togglePickupSelection(p.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 border-t pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Vehicle</Label>
                    <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select vehicle" />
                      </SelectTrigger>
                      <SelectContent>
                        {suggestVehicles.filter((v) => !suggestBusyIds.has(v.id)).map((v) => (
                          <SelectItem key={v.id} value={v.id} className="text-xs">
                            {v.registration_number} — {VEHICLE_TYPE_LABELS[v.vehicle_type]} ({v.capacity_kg} kg)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Farmer</Label>
                    <Select value={selectedFarmer} onValueChange={setSelectedFarmer}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select farmer" />
                      </SelectTrigger>
                      <SelectContent>
                        {suggestFarmers.filter((f) => f.farm_lat && f.farm_lng).map((f) => (
                          <SelectItem key={f.id} value={f.id} className="text-xs">
                            {f.full_name || f.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={handleCreateJobFromSelection}
                  disabled={creatingJob || !selectedVehicle || !selectedFarmer}
                >
                  {creatingJob ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
                  Create Job ({selectedPickupIds.size} pickups)
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Remaining suggestions */}
          {suggestions.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium mb-3 text-sm">Suggested Groupings</h3>
                <div className="space-y-2">
                  {suggestions.map((s, i) => {
                    const color = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
                    return (
                      <div
                        key={s.pickupIds.join(",")}
                        className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => selectCluster(i)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <div>
                            <span className="text-sm font-medium">
                              {s.pickups.length} pickup{s.pickups.length !== 1 ? "s" : ""}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {s.pickups.map((p) => p.org_name).join(", ")}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                          <span>{Math.round(s.totalWeightKg)} kg</span>
                          <span>{s.farmerName}</span>
                          <span>{VEHICLE_TYPE_LABELS[s.vehicleType]}</span>
                          <span>₹{Math.round(s.estimatedCostRs).toLocaleString("en-IN")}</span>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); selectCluster(i); }}>
                            Select
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {skippedPickups.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {skippedPickups.length} pickup(s) not included — missing coordinates.
            </p>
          )}

          {allOptimizerPickups.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  icon={Sparkles}
                  title="All pickups assigned"
                  description="All verified pickups have been assigned to jobs."
                />
              </CardContent>
            </Card>
          )}
        </div>
      ) : filteredPickups.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Truck}
              title={statusFilter ? "No matching pickups" : "No pickups"}
              description={statusFilter ? `No pickups with status "${PICKUP_STATUS_LABELS[statusFilter]}".` : "No pickups have been scheduled yet."}
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
                {filteredPickups.map((pickup) => {
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
                        {formatDateDDMMYYYY(pickup.scheduled_date)}
                      </TableCell>
                      <TableCell>
                        {pickup.estimated_weight_kg ? (
                          <span className="inline-flex items-center gap-1">
                            {pickup.estimated_weight_kg} kg
                            {pickup.status !== "requested" && (
                              <span title="Weight locked after verification"><Lock className="h-3 w-3 text-amber-600" /></span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
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
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openVerifyDialog(pickup)}
                              >
                                <ShieldCheck className="mr-1 h-3 w-3" />
                                Verify
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCancelPickup(pickup.id)}
                                disabled={cancellingPickupId === pickup.id}
                              >
                                <XCircle className="mr-1 h-3 w-3" />
                                {cancellingPickupId === pickup.id ? "..." : "Cancel"}
                              </Button>
                            </>
                          )}
                          {pickup.status === "in_transit" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkArrivedProcessor(pickup.id)}
                              disabled={markingDeliveredId === pickup.id}
                            >
                              <CheckCircle className="mr-1 h-3 w-3" />
                              {markingDeliveredId === pickup.id ? "..." : "Mark Arrived"}
                            </Button>
                          )}
                          {pickup.status === "accepted" && (
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
                      toast.error("Pickup date must be at least 2 days from today");
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
            {(() => {
              const wastePhotos = verifyingPickup?.waste_photo_urls?.filter(Boolean) ?? [];
              const beforeUrl = verifyingPickup?.photo_before_url;
              const afterUrl = verifyingPickup?.photo_after_url;
              const hasAnyPhotos = wastePhotos.length > 0 || beforeUrl || afterUrl;
              if (!hasAnyPhotos) {
                return (
                  <p className="text-sm text-muted-foreground italic">
                    No waste photos uploaded for this pickup.
                  </p>
                );
              }
              return (
                <div className="space-y-2">
                  <Label>Photos</Label>
                  <div className="flex gap-2 overflow-x-auto">
                    {wastePhotos.map((url, i) => (
                      <a key={`waste-${i}`} href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt={`Waste photo ${i + 1}`}
                          className="h-32 w-32 rounded-md border object-cover hover:opacity-80 transition-opacity"
                        />
                      </a>
                    ))}
                    {beforeUrl && (
                      <a href={beforeUrl} target="_blank" rel="noopener noreferrer" className="relative">
                        <img
                          src={beforeUrl}
                          alt="Before pickup"
                          className="h-32 w-32 rounded-md border object-cover hover:opacity-80 transition-opacity"
                        />
                        <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded">Before</span>
                      </a>
                    )}
                    {afterUrl && (
                      <a href={afterUrl} target="_blank" rel="noopener noreferrer" className="relative">
                        <img
                          src={afterUrl}
                          alt="After pickup"
                          className="h-32 w-32 rounded-md border object-cover hover:opacity-80 transition-opacity"
                        />
                        <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded">After</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })()}
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
