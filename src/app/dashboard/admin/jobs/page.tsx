"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/hooks/use-realtime";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  PICKUP_STATUS_LABELS,
  PICKUP_STATUS_COLORS,
  VEHICLE_TYPE_LABELS,
  GREEN_WASTE_DENSITY_KG_PER_M3,
} from "@/lib/constants";
import {
  ClipboardList,
  Plus,
  Eye,
  AlertTriangle,
  Sparkles,
  Pencil,
  Trash2,
  Loader2,
  X,
  IndianRupee,
} from "lucide-react";
import Link from "next/link";
import type { JobStatus, PickupStatus, VehicleType } from "@/types";
import { toast } from "sonner";
import {
  optimizeJobs,
  type OptimizerPickup,
  type OptimizerFarmer,
  type OptimizerRate,
  type OptimizerVehicle,
} from "@/lib/job-optimizer";
import { createJobFromSuggestion } from "@/lib/create-job";
import type { SupabaseClient } from "@supabase/supabase-js";

// --- Local types ---

interface JobRow {
  id: string;
  job_number: string;
  vehicle_id: string;
  farmer_id: string;
  driver_id: string | null;
  scheduled_date: string;
  status: JobStatus;
  notes: string | null;
  total_cost_rs: number | null;
  estimated_trips: number | null;
  estimated_distance_km: number | null;
  created_at: string;
  vehicles: { registration_number: string; vehicle_type: VehicleType } | null;
  drivers: { name: string } | null;
  profiles: { full_name: string | null } | null;
  job_pickups: { count: number }[] | null;
  latest_pickup_status: PickupStatus | null;
}

interface RateRow {
  vehicle_type: VehicleType;
  base_fare_rs: number;
  per_km_rs: number;
}

interface DriverInfo {
  driver_id: string;
  drivers: {
    id: string;
    name: string;
    phone: string;
    license_number: string;
  };
}

interface VehicleOption {
  id: string;
  registration_number: string;
  vehicle_type: VehicleType;
  capacity_kg: number;
  volume_capacity_m3: number | null;
  vehicle_drivers: DriverInfo[];
}

interface FarmerOption {
  id: string;
  full_name: string | null;
  email: string | null;
  farmer_details: {
    farm_name: string | null;
    farm_address: string | null;
    farm_lat: number | null;
    farm_lng: number | null;
    is_active: boolean;
  }[] | null;
}

interface PendingPickup {
  id: string;
  pickup_number: string;
  organization_id: string;
  estimated_weight_kg: number | null;
  estimated_volume_m3: number | null;
  scheduled_date: string;
  scheduled_slot: string | null;
  org_name: string;
  org_address: string;
  org_type: string;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  existing_jobs: string[];
}

interface DraftJobPickup {
  id: string;
  pickup_id: string;
  pickup_number: string;
  org_name: string;
  estimated_weight_kg: number | null;
}

// createJobFromSuggestion imported from "@/lib/create-job"

// --- Component ---

export default function AdminJobsPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [editingDraftJob, setEditingDraftJob] = useState<JobRow | null>(null);

  // Pickup status progression order for determining "most advanced"
  const PICKUP_STATUS_ORDER: PickupStatus[] = [
    "requested", "verified", "assigned", "picked_up", "in_transit",
    "delivered", "received", "processed", "rejected", "cancelled",
  ];

  const fetchJobs = useCallback(async () => {
    const { data } = await supabase
      .from("jobs")
      .select(
        "id, job_number, vehicle_id, farmer_id, driver_id, scheduled_date, status, notes, total_cost_rs, estimated_trips, estimated_distance_km, created_at, vehicles(registration_number, vehicle_type), drivers(name), profiles!jobs_farmer_id_fkey(full_name), job_pickups(count)"
      )
      .order("created_at", { ascending: false });

    if (!data) {
      setLoading(false);
      return;
    }

    // Fetch pickup statuses for all jobs via job_pickups
    const jobIds = data.map((j) => j.id);
    const { data: jpData } = jobIds.length > 0
      ? await supabase
          .from("job_pickups")
          .select("job_id, pickups(status)")
          .in("job_id", jobIds)
      : { data: null };

    // Build a map of job_id -> most advanced pickup status
    const pickupStatusMap = new Map<string, PickupStatus>();
    for (const jp of (jpData ?? []) as unknown as { job_id: string; pickups: { status: PickupStatus } | null }[]) {
      if (!jp.pickups?.status) continue;
      const current = pickupStatusMap.get(jp.job_id);
      const currentIdx = current ? PICKUP_STATUS_ORDER.indexOf(current) : -1;
      const newIdx = PICKUP_STATUS_ORDER.indexOf(jp.pickups.status);
      if (newIdx > currentIdx) {
        pickupStatusMap.set(jp.job_id, jp.pickups.status);
      }
    }

    const jobsWithPickupStatus = data.map((j) => ({
      ...j,
      latest_pickup_status: pickupStatusMap.get(j.id) ?? null,
    }));

    setJobs(jobsWithPickupStatus as unknown as JobRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useRealtime({
    table: "jobs",
    channelName: "admin-jobs",
    onData: () => fetchJobs(),
  });

  async function handleAutoOptimize() {
    setOptimizing(true);
    const toastId = toast.loading("Running auto-optimizer...");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const scheduledDate = tomorrow.toISOString().split("T")[0];

    const [
      pickupResult,
      farmerResult,
      rateResult,
      vehicleResult,
      busyResult,
    ] = await Promise.all([
      supabase
        .from("pickups")
        .select("id, pickup_number, estimated_weight_kg, estimated_volume_m3, organizations(name, lat, lng)")
        .eq("status", "verified")
        .lte("scheduled_date", scheduledDate),
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

    const { data: pickupData } = pickupResult;
    const { data: farmerData } = farmerResult;
    const { data: rateData } = rateResult;
    const { data: vehicleData } = vehicleResult;
    const { data: busyData } = busyResult;

    const busyIds = new Set((busyData ?? []).map((j) => j.vehicle_id));

    // Vehicles with at least one driver
    const allVehiclesWithDrivers = (vehicleData ?? []).filter(
      (v: Record<string, unknown>) => {
        const drivers = v.vehicle_drivers as unknown[];
        return drivers && drivers.length > 0;
      },
    ) as unknown as VehicleOption[];

    // Map data into optimizer input types
    const optimizerPickups: OptimizerPickup[] = (pickupData ?? []).map(
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

    const optimizerFarmers: OptimizerFarmer[] = (farmerData ?? [])
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

    const optimizerRates: OptimizerRate[] = (rateData ?? []).map(
      (r: Record<string, unknown>) => ({
        vehicle_type: r.vehicle_type as VehicleType,
        base_fare_rs: r.base_fare_rs as number,
        per_km_rs: r.per_km_rs as number,
      }),
    );

    const availableVehicles: OptimizerVehicle[] = allVehiclesWithDrivers
      .filter((v) => !busyIds.has(v.id))
      .map((v) => ({
        id: v.id,
        vehicle_type: v.vehicle_type,
        capacity_kg: v.capacity_kg,
        volume_capacity_m3: v.volume_capacity_m3,
      }));

    if (optimizerPickups.length === 0) {
      toast.dismiss(toastId);
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

    if (result.suggestions.length === 0) {
      toast.dismiss(toastId);
      toast.warning("No optimization suggestions — check pickup coordinates and farmer locations");
      setOptimizing(false);
      return;
    }

    // Create draft jobs from suggestions
    const localBusyIds = new Set(busyIds);
    const createdJobs: string[] = [];
    let skippedCount = 0;

    for (const suggestion of result.suggestions) {
      const availableOfType = allVehiclesWithDrivers.filter(
        (v) =>
          v.vehicle_type === suggestion.vehicleType &&
          !localBusyIds.has(v.id),
      );

      if (availableOfType.length === 0) {
        skippedCount++;
        continue;
      }

      const vehicle = availableOfType[0];
      const driver = vehicle.vehicle_drivers[0]?.drivers;

      const jobResult = await createJobFromSuggestion(supabase, {
        scheduledDate,
        vehicleId: vehicle.id,
        driverId: driver?.id ?? null,
        farmerId: suggestion.farmerId,
        pickupIds: suggestion.pickupIds,
        notes: `Auto-optimized: ${suggestion.pickups.length} pickups`,
        status: "draft",
        totalCostRs: suggestion.estimatedCostRs,
        estimatedTrips: suggestion.estimatedTrips,
        estimatedDistanceKm: suggestion.estimatedDistanceKm,
      });

      if ("error" in jobResult) {
        skippedCount++;
        continue;
      }

      createdJobs.push(jobResult.jobNumber);
      localBusyIds.add(vehicle.id);
    }

    toast.dismiss(toastId);

    if (createdJobs.length > 0) {
      toast.success(`Created ${createdJobs.length} draft job(s)`);
      if (skippedCount > 0) {
        toast.warning(`${skippedCount} cluster(s) skipped (no available vehicles)`);
      }
      if (result.skippedPickups.length > 0) {
        toast.warning(`${result.skippedPickups.length} pickup(s) skipped (no coordinates)`);
      }
      fetchJobs();
    } else {
      toast.error("No draft jobs created — no available vehicles");
    }

    setOptimizing(false);
  }

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description="Dispatch vehicles to pickup waste"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleAutoOptimize} disabled={optimizing}>
              {optimizing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Auto-Optimize
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create Job
            </Button>
          </div>
        }
      />

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={ClipboardList}
              title="No jobs"
              description="Create a job to batch-assign pickups to a vehicle and farmer."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job #</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Farmer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Pickups</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">
                      {job.job_number}
                    </TableCell>
                    <TableCell>
                      {job.vehicles?.registration_number ?? "—"}
                    </TableCell>
                    <TableCell>
                      {job.drivers?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {job.profiles?.full_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {new Date(job.scheduled_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </TableCell>
                    <TableCell>
                      {job.job_pickups?.[0]?.count ?? 0}
                    </TableCell>
                    <TableCell>
                      {job.total_cost_rs != null ? (
                        <span className="text-sm">
                          {Math.round(job.total_cost_rs).toLocaleString("en-IN")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant="secondary"
                          className={JOB_STATUS_COLORS[job.status]}
                        >
                          {JOB_STATUS_LABELS[job.status]}
                        </Badge>
                        {job.latest_pickup_status && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${PICKUP_STATUS_COLORS[job.latest_pickup_status]}`}
                          >
                            {PICKUP_STATUS_LABELS[job.latest_pickup_status]}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingDraftJob(job)}
                      >
                        {job.status === "draft" ? (
                          <Pencil className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CreateJobDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={fetchJobs}
      />

      {editingDraftJob && (
        <EditDraftJobDialog
          job={editingDraftJob}
          open={!!editingDraftJob}
          onOpenChange={(open) => {
            if (!open) setEditingDraftJob(null);
          }}
          onUpdated={() => {
            setEditingDraftJob(null);
            fetchJobs();
          }}
        />
      )}
    </div>
  );
}

// --- Edit Draft Job Dialog ---

function EditDraftJobDialog({
  job,
  open,
  onOpenChange,
  onUpdated,
}: {
  job: JobRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [farmers, setFarmers] = useState<FarmerOption[]>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [busyVehicleIds, setBusyVehicleIds] = useState<Set<string>>(new Set());
  const [jobPickups, setJobPickups] = useState<DraftJobPickup[]>([]);

  const [selectedVehicle, setSelectedVehicle] = useState(job.vehicle_id);
  const [selectedDriver, setSelectedDriver] = useState(job.driver_id ?? "");
  const [selectedFarmer, setSelectedFarmer] = useState(job.farmer_id);
  const [notes, setNotes] = useState(job.notes ?? "");
  const [trips, setTrips] = useState<string>(
    job.estimated_trips != null ? String(job.estimated_trips) : "",
  );
  const [distanceKm, setDistanceKm] = useState<string>(
    job.estimated_distance_km != null ? String(job.estimated_distance_km) : "",
  );
  const [totalCost, setTotalCost] = useState<string>(
    job.total_cost_rs != null ? String(job.total_cost_rs) : "",
  );
  const [costOverridden, setCostOverridden] = useState(false);
  const [tripsOverridden, setTripsOverridden] = useState(false);

  const selectedVehicleObj = vehicles.find((v) => v.id === selectedVehicle);
  const vehicleDrivers = selectedVehicleObj?.vehicle_drivers ?? [];

  // Auto-calculate trips when vehicle or pickups change (unless overridden)
  useEffect(() => {
    if (tripsOverridden || loading || !selectedVehicleObj) return;

    const totalWeightKg = jobPickups.reduce(
      (sum, jp) => sum + (jp.estimated_weight_kg ?? 0),
      0,
    );
    const totalVolumeM3 = jobPickups.reduce(
      (sum, jp) =>
        sum + ((jp.estimated_weight_kg ?? 0) / GREEN_WASTE_DENSITY_KG_PER_M3),
      0,
    );

    const capKg = selectedVehicleObj.capacity_kg;
    const capM3 = selectedVehicleObj.volume_capacity_m3 ?? 0;
    const tripsByWeight = capKg > 0 ? Math.ceil(totalWeightKg / capKg) : 1;
    const tripsByVolume = capM3 > 0 ? Math.ceil(totalVolumeM3 / capM3) : 1;
    const calcTrips = Math.max(tripsByWeight, tripsByVolume, 1);
    setTrips(String(calcTrips));
  }, [selectedVehicleObj, jobPickups, tripsOverridden, loading]);

  // Auto-calculate cost from trips × (base_fare + per_km × distance)
  useEffect(() => {
    if (costOverridden || loading) return;
    if (!selectedVehicleObj || rates.length === 0) return;

    const rate = rates.find((r) => r.vehicle_type === selectedVehicleObj.vehicle_type);
    if (!rate) {
      setTotalCost("");
      return;
    }

    const numTrips = parseInt(trips) || 1;
    const numDist = parseFloat(distanceKm) || 0;
    const cost = numTrips * (rate.base_fare_rs + rate.per_km_rs * numDist);
    setTotalCost(String(Math.round(cost)));
  }, [selectedVehicleObj, trips, distanceKm, rates, costOverridden, loading]);

  useEffect(() => {
    if (!open) return;

    async function load() {
      setLoading(true);
      setCostOverridden(false);
      setTripsOverridden(false);

      const [{ data: vehicleData }, { data: farmerData }, { data: jpData }, { data: busyData }, { data: rateData }] =
        await Promise.all([
          supabase
            .from("vehicles")
            .select(
              "id, registration_number, vehicle_type, capacity_kg, volume_capacity_m3, vehicle_drivers(driver_id, drivers(id, name, phone, license_number))"
            )
            .eq("is_active", true)
            .order("registration_number"),
          supabase
            .from("profiles")
            .select(
              "id, full_name, email, farmer_details(farm_name, farm_address, farm_lat, farm_lng, is_active)"
            )
            .eq("role", "farmer"),
          supabase
            .from("job_pickups")
            .select("id, pickup_id, pickups(pickup_number, estimated_weight_kg, organizations(name))")
            .eq("job_id", job.id),
          supabase
            .from("jobs")
            .select("vehicle_id")
            .eq("scheduled_date", job.scheduled_date)
            .in("status", ["draft", "pending", "dispatched", "in_progress"])
            .neq("id", job.id),
          supabase.from("vehicle_type_rates").select("vehicle_type, base_fare_rs, per_km_rs"),
        ]);

      const withDrivers = (vehicleData ?? []).filter(
        (v: Record<string, unknown>) => {
          const drivers = v.vehicle_drivers as unknown[];
          return drivers && drivers.length > 0;
        },
      ) as unknown as VehicleOption[];
      setVehicles(withDrivers);

      if (farmerData) setFarmers(farmerData as unknown as FarmerOption[]);
      if (rateData) setRates(rateData as unknown as RateRow[]);

      if (busyData) {
        setBusyVehicleIds(new Set(busyData.map((j) => j.vehicle_id)));
      }

      if (jpData) {
        setJobPickups(
          (jpData as unknown as {
            id: string;
            pickup_id: string;
            pickups: {
              pickup_number: string;
              estimated_weight_kg: number | null;
              organizations: { name: string } | null;
            };
          }[]).map((jp) => ({
            id: jp.id,
            pickup_id: jp.pickup_id,
            pickup_number: jp.pickups.pickup_number,
            org_name: jp.pickups.organizations?.name ?? "",
            estimated_weight_kg: jp.pickups.estimated_weight_kg,
          })),
        );
      }

      // Initialize from saved values
      if (job.estimated_trips != null) {
        setTrips(String(job.estimated_trips));
        setTripsOverridden(true);
      }
      if (job.estimated_distance_km != null) {
        setDistanceKm(String(job.estimated_distance_km));
      }
      if (job.total_cost_rs != null) {
        setTotalCost(String(job.total_cost_rs));
        setCostOverridden(true);
      }

      setLoading(false);
    }
    load();
  }, [open, supabase, job.id, job.scheduled_date, job.total_cost_rs, job.estimated_trips, job.estimated_distance_km]);

  // Include current vehicle in available list
  const availableVehicles = vehicles.filter(
    (v) => !busyVehicleIds.has(v.id) || v.id === job.vehicle_id,
  );

  const parsedCost = totalCost ? parseFloat(totalCost) : null;
  const parsedTrips = trips ? parseInt(trips) : null;
  const parsedDistanceKm = distanceKm ? parseFloat(distanceKm) : null;

  async function handleRemovePickup(jpId: string) {
    if (jobPickups.length <= 1) {
      toast.error("Job must have at least one pickup. Delete the draft instead.");
      return;
    }
    const { error } = await supabase.from("job_pickups").delete().eq("id", jpId);
    if (error) {
      toast.error("Failed to remove pickup");
      return;
    }
    setJobPickups((prev) => prev.filter((p) => p.id !== jpId));
    setTripsOverridden(false);
    setCostOverridden(false);
  }

  async function handleDeleteDraft() {
    setDeleting(true);

    // Delete job_pickups first, then job
    await supabase.from("job_pickups").delete().eq("job_id", job.id);
    const { error } = await supabase.from("jobs").delete().eq("id", job.id);

    if (error) {
      toast.error("Failed to delete draft");
      setDeleting(false);
      return;
    }

    toast.success(`${job.job_number} deleted`);
    onUpdated();
  }

  async function handleSave() {
    setSaving(true);

    const { error } = await supabase
      .from("jobs")
      .update({
        vehicle_id: selectedVehicle,
        driver_id: selectedDriver || null,
        farmer_id: selectedFarmer,
        notes: notes || null,
        total_cost_rs: parsedCost,
        estimated_trips: parsedTrips,
        estimated_distance_km: parsedDistanceKm,
      })
      .eq("id", job.id);

    if (error) {
      toast.error("Failed to save changes");
      setSaving(false);
      return;
    }

    toast.success("Draft updated");
    setSaving(false);
    onUpdated();
  }

  async function handleConfirm() {
    setConfirming(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Update job status to pending
    const { error: jobErr } = await supabase
      .from("jobs")
      .update({
        status: "pending",
        vehicle_id: selectedVehicle,
        driver_id: selectedDriver || null,
        farmer_id: selectedFarmer,
        notes: notes || null,
        total_cost_rs: parsedCost,
        estimated_trips: parsedTrips,
        estimated_distance_km: parsedDistanceKm,
      })
      .eq("id", job.id);

    if (jobErr) {
      toast.error("Failed to confirm job");
      setConfirming(false);
      return;
    }

    // Update pickups to assigned
    const pickupIds = jobPickups.map((jp) => jp.pickup_id);
    if (pickupIds.length > 0) {
      await supabase
        .from("pickups")
        .update({
          status: "assigned",
          vehicle_id: selectedVehicle,
          farmer_id: selectedFarmer,
        })
        .in("id", pickupIds);

      // Insert pickup events
      if (user) {
        await supabase.from("pickup_events").insert(
          pickupIds.map((pid) => ({
            pickup_id: pid,
            status: "assigned",
            changed_by: user.id,
            notes: `Assigned via ${job.job_number}`,
          })),
        );
      }
    }

    toast.success(`${job.job_number} confirmed — now pending`);
    setConfirming(false);
    onUpdated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{job.status === "draft" ? "Edit Draft" : "Job Details"} — {job.job_number}</DialogTitle>
          <DialogDescription>
            {job.status === "draft"
              ? "Edit vehicle, driver, farmer, or remove pickups. Confirm to set the job to pending."
              : `Status: ${job.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading...</p>
        ) : (
          <div className="space-y-4 py-2">
            {/* Vehicle */}
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <Select
                value={selectedVehicle}
                onValueChange={(v) => {
                  setSelectedVehicle(v);
                  const veh = vehicles.find((x) => x.id === v);
                  const drivers = veh?.vehicle_drivers ?? [];
                  setSelectedDriver(
                    drivers.length === 1 ? drivers[0].drivers.id : "",
                  );
                  setTripsOverridden(false);
                  setCostOverridden(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {availableVehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.registration_number} —{" "}
                      {VEHICLE_TYPE_LABELS[v.vehicle_type]} ({v.capacity_kg} kg
                      {v.volume_capacity_m3
                        ? ` / ${v.volume_capacity_m3} m³`
                        : ""}
                      )
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Driver */}
            {selectedVehicle && vehicleDrivers.length > 0 && (
              <div className="space-y-2">
                <Label>Driver</Label>
                {vehicleDrivers.length === 1 ? (
                  <div className="rounded-md border px-3 py-2 text-sm">
                    <p className="font-medium">
                      {vehicleDrivers[0].drivers.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {vehicleDrivers[0].drivers.phone} ·{" "}
                      {vehicleDrivers[0].drivers.license_number}
                    </p>
                  </div>
                ) : (
                  <Select
                    value={selectedDriver}
                    onValueChange={setSelectedDriver}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a driver" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicleDrivers.map((vd) => (
                        <SelectItem key={vd.drivers.id} value={vd.drivers.id}>
                          {vd.drivers.name} · {vd.drivers.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Farmer */}
            <div className="space-y-2">
              <Label>Farmer (Destination)</Label>
              <Select
                value={selectedFarmer}
                onValueChange={setSelectedFarmer}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a farmer" />
                </SelectTrigger>
                <SelectContent>
                  {farmers
                    .filter((f) => f.farmer_details?.[0]?.is_active !== false)
                    .map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.full_name || f.email || f.id}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Trips & Distance */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estimated Trips</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={trips}
                  onChange={(e) => {
                    setTrips(e.target.value);
                    setTripsOverridden(true);
                    setCostOverridden(false);
                  }}
                  placeholder="Auto-calculated"
                  className="bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Distance (km)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={distanceKm}
                  onChange={(e) => {
                    setDistanceKm(e.target.value);
                    setCostOverridden(false);
                  }}
                  placeholder="Enter route distance"
                  className="bg-white"
                />
              </div>
            </div>

            {/* Total Cost */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <IndianRupee className="h-3.5 w-3.5" /> Total Cost (Rs)
              </Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={totalCost}
                onChange={(e) => {
                  setTotalCost(e.target.value);
                  setCostOverridden(true);
                }}
                placeholder="Auto-calculated from rates"
                className="bg-white"
              />
              {costOverridden && (
                <p className="text-xs text-muted-foreground">
                  Cost overridden manually.{" "}
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={() => setCostOverridden(false)}
                  >
                    Recalculate
                  </button>
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes for this job..."
                rows={2}
              />
            </div>

            {/* Pickups */}
            <div className="space-y-2">
              <Label>Pickups ({jobPickups.length})</Label>
              {jobPickups.map((jp) => (
                <div
                  key={jp.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{jp.pickup_number}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {jp.org_name}
                    </span>
                    {jp.estimated_weight_kg && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {jp.estimated_weight_kg} kg
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemovePickup(jp.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {job.status === "draft" && (
          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
            <Button
              variant="destructive"
              onClick={handleDeleteDraft}
              disabled={deleting || saving || confirming}
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete Draft
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={saving || deleting || confirming}
              >
                {saving ? "Saving..." : "Save Draft"}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={confirming || deleting || saving || jobPickups.length === 0}
              >
                {confirming ? "Confirming..." : "Confirm Job"}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Create Job Dialog ---

function CreateJobDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const [step, setStep] = useState(1);

  // Step 1 state
  const [scheduledDate, setScheduledDate] = useState("");
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [farmers, setFarmers] = useState<FarmerOption[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedFarmer, setSelectedFarmer] = useState("");
  const [notes, setNotes] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Step 2 state
  const [nearbyPickups, setNearbyPickups] = useState<PendingPickup[]>([]);
  const [otherPickups, setOtherPickups] = useState<PendingPickup[]>([]);
  const [selectedPickupIds, setSelectedPickupIds] = useState<Set<string>>(
    new Set()
  );
  const [loadingPickups, setLoadingPickups] = useState(false);
  const [creating, setCreating] = useState(false);

  const selectedVehicleObj = vehicles.find((v) => v.id === selectedVehicle);
  const vehicleDrivers = selectedVehicleObj?.vehicle_drivers ?? [];
  const selectedFarmerObj = farmers.find((f) => f.id === selectedFarmer);
  const farmerDetail = selectedFarmerObj?.farmer_details?.[0];

  const allPickups = [...nearbyPickups, ...otherPickups];
  const selectedItems = allPickups.filter((p) => selectedPickupIds.has(p.id));
  const selectedWeight = selectedItems.reduce((sum, p) => sum + (p.estimated_weight_kg ?? 0), 0);
  const selectedVolume = selectedItems.reduce(
    (sum, p) => sum + (p.estimated_volume_m3 ?? (p.estimated_weight_kg ?? 0) / GREEN_WASTE_DENSITY_KG_PER_M3),
    0
  );

  // Trip estimation
  const vehicleVolume = selectedVehicleObj?.volume_capacity_m3;
  const vehicleWeight = selectedVehicleObj?.capacity_kg;
  const tripsByVolume = vehicleVolume ? Math.ceil(selectedVolume / vehicleVolume) : 1;
  const tripsByWeight = vehicleWeight ? Math.ceil(selectedWeight / vehicleWeight) : 1;
  const estimatedTrips = Math.max(tripsByVolume, tripsByWeight);
  const bottleneck = tripsByVolume > tripsByWeight ? "volume" : tripsByWeight > tripsByVolume ? "weight" : null;

  // Compute min date (tomorrow) on the client only
  const [minDate, setMinDate] = useState("");
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setMinDate(tomorrow.toISOString().split("T")[0]);
  }, []);

  // Fetch vehicles & farmers when dialog opens
  useEffect(() => {
    if (!open) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultDate = tomorrow.toISOString().split("T")[0];

    setStep(1);
    setScheduledDate(defaultDate);
    setSelectedVehicle("");
    setSelectedDriver("");
    setSelectedFarmer("");
    setNotes("");
    setSelectedPickupIds(new Set());
    setNearbyPickups([]);
    setOtherPickups([]);

    async function load() {
      setLoadingOptions(true);

      const [{ data: vehicleData }, { data: farmerData }] = await Promise.all([
        supabase
          .from("vehicles")
          .select("id, registration_number, vehicle_type, capacity_kg, volume_capacity_m3, vehicle_drivers(driver_id, drivers(id, name, phone, license_number))")
          .eq("is_active", true)
          .order("registration_number"),
        supabase
          .from("profiles")
          .select("id, full_name, email, farmer_details(farm_name, farm_address, farm_lat, farm_lng, is_active)")
          .eq("role", "farmer"),
      ]);

      const withDrivers = (vehicleData ?? []).filter(
        (v: Record<string, unknown>) => {
          const drivers = v.vehicle_drivers as unknown[];
          return drivers && drivers.length > 0;
        }
      ) as unknown as VehicleOption[];
      setVehicles(withDrivers);

      if (farmerData) setFarmers(farmerData as unknown as FarmerOption[]);
      setLoadingOptions(false);
    }
    load();
  }, [open, supabase]);

  // Fetch active jobs for selected date to filter vehicles
  const [busyVehicleIds, setBusyVehicleIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!scheduledDate) return;
    async function fetchBusy() {
      const { data } = await supabase
        .from("jobs")
        .select("vehicle_id")
        .eq("scheduled_date", scheduledDate)
        .in("status", ["draft", "pending", "dispatched", "in_progress"]);

      if (data) {
        setBusyVehicleIds(new Set(data.map((j) => j.vehicle_id)));
      }
    }
    fetchBusy();
  }, [scheduledDate, supabase]);

  const availableVehicles = vehicles.filter((v) => !busyVehicleIds.has(v.id));

  // Fetch pickups for step 2
  async function loadPickups() {
    setLoadingPickups(true);

    const lat = farmerDetail?.farm_lat;
    const lng = farmerDetail?.farm_lng;

    let nearby: PendingPickup[] = [];

    if (lat && lng) {
      const { data } = await supabase.rpc("nearby_pending_pickups", {
        center_lat: lat,
        center_lng: lng,
        radius_km: 10,
      });
      if (data) {
        nearby = (data as Record<string, unknown>[]).map((r) => ({
          id: r.id as string,
          pickup_number: r.pickup_number as string,
          organization_id: r.organization_id as string,
          estimated_weight_kg: r.estimated_weight_kg as number | null,
          estimated_volume_m3: r.estimated_volume_m3 as number | null,
          scheduled_date: r.scheduled_date as string,
          scheduled_slot: (r.scheduled_slot as string) ?? null,
          org_name: r.org_name as string,
          org_address: r.org_address as string,
          org_type: r.org_type as string,
          lat: r.lat as number | null,
          lng: r.lng as number | null,
          distance_km: r.distance_km as number | null,
          existing_jobs: [],
        }));
      }
    }

    // Only fetch verified pickups scheduled on or before the selected date (overdue + same day)
    const { data: allPending, error: pendingErr } = await supabase
      .from("pickups")
      .select("id, pickup_number, organization_id, estimated_weight_kg, estimated_volume_m3, scheduled_date, scheduled_slot, organizations(name, address, org_type, lat, lng)")
      .eq("status", "verified")
      .lte("scheduled_date", scheduledDate)
      .order("scheduled_date", { ascending: true });

    if (pendingErr) {
      toast.error("Failed to load pending pickups");
    }

    // Filter nearby pickups to same date constraint
    nearby = nearby.filter((p) => p.scheduled_date <= scheduledDate);

    const nearbyIds = new Set(nearby.map((p) => p.id));
    const other: PendingPickup[] = (allPending ?? [])
      .filter((p: Record<string, unknown>) => !nearbyIds.has(p.id as string))
      .map((p: Record<string, unknown>) => {
        const org = p.organizations as Record<string, unknown> | null;
        return {
          id: p.id as string,
          pickup_number: p.pickup_number as string,
          organization_id: p.organization_id as string,
          estimated_weight_kg: p.estimated_weight_kg as number | null,
          estimated_volume_m3: p.estimated_volume_m3 as number | null,
          scheduled_date: p.scheduled_date as string,
          scheduled_slot: (p.scheduled_slot as string) ?? null,
          org_name: (org?.name as string) ?? "",
          org_address: (org?.address as string) ?? "",
          org_type: (org?.org_type as string) ?? "",
          lat: (org?.lat as number) ?? null,
          lng: (org?.lng as number) ?? null,
          distance_km: null,
          existing_jobs: [],
        };
      });

    const allIds = [...nearby, ...other].map((p) => p.id);
    if (allIds.length > 0) {
      const { data: existingJps } = await supabase
        .from("job_pickups")
        .select("pickup_id, jobs(job_number)")
        .in("pickup_id", allIds);

      if (existingJps) {
        const jobMap: Record<string, string[]> = {};
        for (const jp of existingJps as unknown as { pickup_id: string; jobs: { job_number: string } | null }[]) {
          if (!jobMap[jp.pickup_id]) jobMap[jp.pickup_id] = [];
          if (jp.jobs?.job_number) jobMap[jp.pickup_id].push(jp.jobs.job_number);
        }
        nearby = nearby.map((p) => ({ ...p, existing_jobs: jobMap[p.id] ?? [] }));
        const updatedOther = other.map((p) => ({ ...p, existing_jobs: jobMap[p.id] ?? [] }));
        setOtherPickups(sortPickupsByDateAndSlot(updatedOther));
      } else {
        setOtherPickups(sortPickupsByDateAndSlot(other));
      }
    } else {
      setOtherPickups(sortPickupsByDateAndSlot(other));
    }

    setNearbyPickups(sortPickupsByDateAndSlot(nearby));
    setLoadingPickups(false);
  }

  function togglePickup(id: string) {
    setSelectedPickupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    if (selectedPickupIds.size === 0) {
      toast.error("Select at least one pickup");
      return;
    }

    setCreating(true);

    const result = await createJobFromSuggestion(supabase, {
      scheduledDate,
      vehicleId: selectedVehicle,
      driverId: selectedDriver,
      farmerId: selectedFarmer,
      pickupIds: Array.from(selectedPickupIds),
      notes: notes || null,
    });

    if ("error" in result) {
      toast.error(result.error);
      setCreating(false);
      return;
    }

    toast.success(`${result.jobNumber} created with ${selectedPickupIds.size} pickup(s)`);
    setCreating(false);
    onOpenChange(false);
    onCreated();
  }

  function handleNext() {
    if (!selectedVehicle || !selectedDriver || !selectedFarmer) {
      toast.error("Please select a vehicle, driver, and farmer");
      return;
    }
    setStep(2);
    loadPickups();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Job</DialogTitle>
          <DialogDescription>
            Assign a vehicle, driver, and farmer, then select pickups to dispatch.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <>
            <div className="space-y-4 py-2">
              <p className="text-sm font-medium text-muted-foreground">
                Step 1: Vehicle &amp; Farmer
              </p>

              <div className="space-y-2">
                <Label>Scheduled Date</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  min={minDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Vehicle</Label>
                {loadingOptions ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : (
                  <>
                    <Select
                      value={selectedVehicle}
                      onValueChange={(v) => {
                        setSelectedVehicle(v);
                        const veh = vehicles.find((x) => x.id === v);
                        const drivers = veh?.vehicle_drivers ?? [];
                        setSelectedDriver(
                          drivers.length === 1 ? drivers[0].drivers.id : ""
                        );
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a vehicle" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableVehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.registration_number} —{" "}
                            {VEHICLE_TYPE_LABELS[v.vehicle_type]} (
                            {v.capacity_kg} kg
                            {v.volume_capacity_m3 ? ` / ${v.volume_capacity_m3} m³` : ""})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {availableVehicles.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No available vehicles with drivers for this date.
                      </p>
                    )}
                  </>
                )}
              </div>

              {selectedVehicle && vehicleDrivers.length > 0 && (
                <div className="space-y-2">
                  <Label>Driver</Label>
                  {vehicleDrivers.length === 1 ? (
                    <div className="rounded-md border px-3 py-2 text-sm">
                      <p className="font-medium">{vehicleDrivers[0].drivers.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {vehicleDrivers[0].drivers.phone} · {vehicleDrivers[0].drivers.license_number}
                      </p>
                    </div>
                  ) : (
                    <Select
                      value={selectedDriver}
                      onValueChange={setSelectedDriver}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a driver" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicleDrivers.map((vd) => (
                          <SelectItem key={vd.drivers.id} value={vd.drivers.id}>
                            {vd.drivers.name} · {vd.drivers.phone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Farmer (Destination)</Label>
                <Select
                  value={selectedFarmer}
                  onValueChange={setSelectedFarmer}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a farmer" />
                  </SelectTrigger>
                  <SelectContent>
                    {farmers
                      .filter((f) => f.farmer_details?.[0]?.is_active !== false)
                      .map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.full_name || f.email || f.id}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {selectedFarmerObj && farmerDetail?.farm_name && (
                  <p className="text-xs text-muted-foreground">
                    {farmerDetail.farm_name}
                    {farmerDetail.farm_address
                      ? `, ${farmerDetail.farm_address}`
                      : ""}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any notes for this job..."
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between">
              <p className="text-xs text-muted-foreground">Step 1 of 2</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleNext}>Next — Select Pickups →</Button>
              </div>
            </DialogFooter>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-4 py-2">
              <p className="text-sm font-medium text-muted-foreground">
                Step 2: Select Pickups
              </p>

              {loadingPickups ? (
                <p className="text-sm text-muted-foreground">
                  Loading verified pickups...
                </p>
              ) : (
                <>
                  {nearbyPickups.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Nearby verified pickups (within 10 km of farm)
                      </p>
                      {nearbyPickups.map((p) => (
                        <PickupRow
                          key={p.id}
                          pickup={p}
                          checked={selectedPickupIds.has(p.id)}
                          onToggle={() => togglePickup(p.id)}
                          showDistance
                        />
                      ))}
                    </div>
                  )}

                  {otherPickups.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {nearbyPickups.length > 0
                          ? "Other verified pickups"
                          : "Verified pickups"}
                      </p>
                      {otherPickups.map((p) => (
                        <PickupRow
                          key={p.id}
                          pickup={p}
                          checked={selectedPickupIds.has(p.id)}
                          onToggle={() => togglePickup(p.id)}
                        />
                      ))}
                    </div>
                  )}

                  {nearbyPickups.length === 0 && otherPickups.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No verified pickups available.
                    </p>
                  )}
                </>
              )}

              {selectedPickupIds.size > 0 && (
                <div className="rounded-md border p-3 bg-muted/50 text-sm space-y-1">
                  <p>
                    Selected: <strong>{selectedPickupIds.size}</strong> pickup
                    {selectedPickupIds.size !== 1 ? "s" : ""}
                  </p>
                  <p className="text-muted-foreground">
                    Est. weight: <strong>~{selectedWeight.toLocaleString()} kg</strong>
                    {selectedVehicleObj && (
                      <> / {selectedVehicleObj.capacity_kg.toLocaleString()} kg capacity</>
                    )}
                  </p>
                  {vehicleVolume && (
                    <p className="text-muted-foreground">
                      Est. volume: <strong>~{selectedVolume.toFixed(1)} m³</strong>
                      {" "}/ {vehicleVolume} m³ capacity
                    </p>
                  )}
                  {selectedVehicleObj && (
                    <p className="text-muted-foreground">
                      Estimated trips: <strong>{estimatedTrips}</strong>
                    </p>
                  )}
                  {estimatedTrips > 1 && (
                    <p className="text-amber-700 font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {estimatedTrips} trips needed — {bottleneck === "volume" ? "volume" : bottleneck === "weight" ? "weight" : "both weight and volume"} exceeds single-trip capacity
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between">
              <p className="text-xs text-muted-foreground">Step 2 of 2</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  ← Back
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? "Creating..." : "Create Job"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Pickup Row for step 2 ---

function PickupRow({
  pickup,
  checked,
  onToggle,
  showDistance,
}: {
  pickup: PendingPickup;
  checked: boolean;
  onToggle: () => void;
  showDistance?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{pickup.pickup_number}</span>
          <span className="text-sm text-muted-foreground">
            · {pickup.org_name}
          </span>
          {showDistance && pickup.distance_km != null && (
            <span className="text-xs text-muted-foreground">
              · {pickup.distance_km.toFixed(1)} km
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {pickup.scheduled_date}
          {pickup.scheduled_slot ? ` · ${capitalize(pickup.scheduled_slot)}` : ""}
          {pickup.estimated_weight_kg
            ? ` · Est. ${pickup.estimated_weight_kg} kg`
            : " · Weight TBD"}
          {pickup.org_type ? ` · ${capitalize(pickup.org_type)}` : ""}
          {pickup.org_address ? ` · ${pickup.org_address}` : ""}
        </div>
        {pickup.existing_jobs.length > 0 && (
          <div className="flex items-center gap-1 mt-1 text-xs text-yellow-700">
            <AlertTriangle className="h-3 w-3" />
            Already in {pickup.existing_jobs.join(", ")}
          </div>
        )}
      </div>
    </label>
  );
}

const SLOT_ORDER: Record<string, number> = { morning: 0, afternoon: 1, evening: 2 };

function sortPickupsByDateAndSlot<T extends { scheduled_date: string; scheduled_slot: string | null }>(pickups: T[]): T[] {
  return [...pickups].sort((a, b) => {
    const dateCmp = a.scheduled_date.localeCompare(b.scheduled_date);
    if (dateCmp !== 0) return dateCmp;
    const slotA = SLOT_ORDER[a.scheduled_slot ?? ""] ?? 3;
    const slotB = SLOT_ORDER[b.scheduled_slot ?? ""] ?? 3;
    return slotA - slotB;
  });
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}
