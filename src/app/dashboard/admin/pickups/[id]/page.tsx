"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { TripCard } from "@/components/shared/trip-card";
import { PickupDetailCard } from "@/components/shared/pickup-detail-card";
import { PickupTimeline } from "@/components/shared/pickup-timeline";
import { ArrowLeft, CheckCircle, FileText, XCircle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { RatingDisplay } from "@/components/shared/rating-form";
import type { Pickup, PickupEvent, PickupTrip } from "@/types";

export default function AdminPickupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: userLoading } = useUser();
  const supabase = createClient();

  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [events, setEvents] = useState<(PickupEvent & { profile_name?: string })[]>([]);
  const [trips, setTrips] = useState<PickupTrip[]>([]);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [vehicleRegNumber, setVehicleRegNumber] = useState<string | null>(null);
  const [farmerName, setFarmerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingDelivered, setMarkingDelivered] = useState(false);
  const [generatingManifest, setGeneratingManifest] = useState(false);
  const [markingProcessed, setMarkingProcessed] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [ratings, setRatings] = useState<{ id: string; rating: number; comment: string | null; role: string; created_at: string }[]>([]);

  const refetchEvents = useCallback(async () => {
    const { data: eventsData } = await supabase
      .from("pickup_events")
      .select("*, profiles:changed_by(full_name)")
      .eq("pickup_id", id)
      .order("created_at", { ascending: true });

    if (eventsData) {
      setEvents(
        eventsData.map((e) => ({
          ...e,
          profile_name: (e.profiles as unknown as { full_name: string })?.full_name,
        })) as (PickupEvent & { profile_name?: string })[]
      );
    }
  }, [supabase, id]);

  const refetchTrips = useCallback(async () => {
    const { data } = await supabase
      .from("pickup_trips")
      .select("*")
      .eq("pickup_id", id)
      .order("trip_number", { ascending: true });
    if (data) setTrips(data as unknown as PickupTrip[]);
  }, [supabase, id]);

  // Realtime: pickup updates
  useRealtime({
    table: "pickups",
    filter: `id=eq.${id}`,
    event: "UPDATE",
    channelName: `admin-pickup-${id}`,
    onData: (payload) => {
      const updated = payload.new as Record<string, unknown>;
      setPickup((prev) => (prev ? { ...prev, ...updated } : prev));
    },
  });

  // Realtime: new pickup events
  useRealtime({
    table: "pickup_events",
    filter: `pickup_id=eq.${id}`,
    event: "INSERT",
    channelName: `admin-pickup-events-${id}`,
    onData: () => {
      refetchEvents();
    },
  });

  // Realtime: trip updates
  useRealtime({
    table: "pickup_trips",
    filter: `pickup_id=eq.${id}`,
    event: "*",
    channelName: `admin-pickup-trips-${id}`,
    onData: () => {
      refetchTrips();
    },
  });

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const { data: pickupData } = await supabase
        .from("pickups")
        .select("*")
        .eq("id", id)
        .single();

      if (!pickupData) {
        setLoading(false);
        return;
      }

      setPickup(pickupData as Pickup);

      // Fetch org name
      const { data: orgData } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", pickupData.organization_id)
        .single();
      if (orgData) setOrgName(orgData.name);

      // Fetch vehicle info
      if (pickupData.vehicle_id) {
        const { data } = await supabase
          .from("vehicles")
          .select("registration_number")
          .eq("id", pickupData.vehicle_id)
          .single();
        if (data) setVehicleRegNumber(data.registration_number);
      }

      // Fetch farmer info
      if (pickupData.farmer_id) {
        const { data } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", pickupData.farmer_id)
          .single();
        if (data) setFarmerName(data.full_name);
      }

      // Fetch events
      const { data: eventsData } = await supabase
        .from("pickup_events")
        .select("*, profiles:changed_by(full_name)")
        .eq("pickup_id", id)
        .order("created_at", { ascending: true });

      if (eventsData) {
        setEvents(
          eventsData.map((e) => ({
            ...e,
            profile_name: (e.profiles as unknown as { full_name: string })?.full_name,
          })) as (PickupEvent & { profile_name?: string })[]
        );
      }

      // Fetch trips
      const { data: tripsData } = await supabase
        .from("pickup_trips")
        .select("*")
        .eq("pickup_id", id)
        .order("trip_number", { ascending: true });
      if (tripsData) setTrips(tripsData as unknown as PickupTrip[]);

      // Fetch ratings
      const { data: ratingsData } = await supabase
        .from("pickup_ratings")
        .select("id, rating, comment, role, created_at")
        .eq("pickup_id", id)
        .order("created_at", { ascending: true });
      if (ratingsData) setRatings(ratingsData);

      setLoading(false);
    }
    fetchData();
  }, [user, id, supabase]);

  async function handleMarkArrivedProcessor() {
    if (!user || !pickup) return;
    setMarkingDelivered(true);

    const { error } = await supabase
      .from("pickups")
      .update({
        status: "arrived_processor",
        delivered_at: new Date().toISOString(),
      })
      .eq("id", pickup.id);

    if (error) {
      toast.error("Failed to mark arrived at processor");
      setMarkingDelivered(false);
      return;
    }

    await supabase.from("pickup_events").insert({
      pickup_id: pickup.id,
      status: "arrived_processor",
      changed_by: user.id,
      notes: "Marked arrived at processor by admin",
    });

    setPickup({ ...pickup, status: "arrived_processor" });
    toast.success("Pickup marked as arrived at processor");
    setMarkingDelivered(false);
  }

  async function handleGenerateManifest() {
    if (!user || !pickup) return;
    setGeneratingManifest(true);

    const { error } = await supabase.from("compliance_docs").insert({
      doc_type: "manifest",
      organization_id: pickup.organization_id,
      pickup_id: pickup.id,
      metadata: {
        pickup_number: pickup.pickup_number,
        scheduled_date: pickup.scheduled_date,
        vehicle: vehicleRegNumber,
        farmer: farmerName,
        estimated_weight_kg: pickup.estimated_weight_kg,
        actual_weight_kg: pickup.actual_weight_kg,
        trip_count: trips.length,
        generated_by: user.id,
      },
    });

    if (error) {
      toast.error("Failed to generate manifest");
      setGeneratingManifest(false);
      return;
    }

    toast.success("Transport manifest generated");
    setGeneratingManifest(false);
  }

  async function handleMarkProcessed() {
    if (!user || !pickup) return;
    setMarkingProcessed(true);

    const { error } = await supabase
      .from("pickups")
      .update({ status: "processed" })
      .eq("id", pickup.id);

    if (error) {
      toast.error("Failed to mark as processed");
      setMarkingProcessed(false);
      return;
    }

    await supabase.from("pickup_events").insert({
      pickup_id: pickup.id,
      status: "processed",
      changed_by: user.id,
      notes: "Marked processed by admin",
    });

    setPickup({ ...pickup, status: "processed" });
    toast.success("Pickup marked as processed");
    setMarkingProcessed(false);
  }

  async function handleCancel() {
    if (!user || !pickup) return;
    if (pickup.status !== "requested") {
      toast.error("Only unverified pickups can be cancelled");
      return;
    }
    if (!window.confirm("Cancel this pickup request? Prepaid credits will be restored if applicable.")) {
      return;
    }
    setCancelling(true);

    const { error } = await supabase
      .from("pickups")
      .update({ status: "cancelled" })
      .eq("id", pickup.id);

    if (error) {
      toast.error("Failed to cancel pickup");
      setCancelling(false);
      return;
    }

    await supabase.from("pickup_events").insert({
      pickup_id: pickup.id,
      status: "cancelled",
      changed_by: user.id,
      notes: "Cancelled by admin",
    });

    setPickup({ ...pickup, status: "cancelled" });
    toast.success("Pickup cancelled");
    setCancelling(false);
  }

  if (userLoading || loading) return <DashboardSkeleton />;
  if (!pickup) {
    return (
      <div className="space-y-6">
        <PageHeader title="Pickup not found" />
        <Button variant="outline" asChild>
          <Link href="/dashboard/admin/pickups">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Pickups
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Pickup ${pickup.pickup_number}`}
        action={
          <Button variant="outline" asChild>
            <Link href="/dashboard/admin/pickups">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <PickupDetailCard
          pickup={pickup}
          vehicleRegNumber={vehicleRegNumber}
          farmerName={farmerName}
          orgName={orgName}
        />
        <PickupTimeline events={events} />
      </div>

      <TripCard trips={trips} showGeoData={true} />

      <RatingDisplay ratings={ratings} />

      <div className="flex gap-3 justify-end">
        {pickup.status === "requested" && (
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={cancelling}
          >
            <XCircle className="mr-2 h-4 w-4" />
            {cancelling ? "Cancelling..." : "Cancel Pickup"}
          </Button>
        )}
        {pickup.status === "in_transit" && (
          <Button
            onClick={handleMarkArrivedProcessor}
            disabled={markingDelivered}
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            {markingDelivered ? "Marking..." : "Mark Arrived at Processor"}
          </Button>
        )}
        {pickup.status === "accepted" && (
          <>
            <Button
              onClick={handleMarkProcessed}
              disabled={markingProcessed}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {markingProcessed ? "Marking..." : "Mark Processed"}
            </Button>
            <Button
              variant="outline"
              onClick={handleGenerateManifest}
              disabled={generatingManifest}
            >
              <FileText className="mr-2 h-4 w-4" />
              {generatingManifest ? "Generating..." : "Generate Manifest"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
