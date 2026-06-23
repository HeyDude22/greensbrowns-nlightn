"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useRealtime } from "@/hooks/use-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { PhotoDisplay } from "@/components/shared/photo-display";
import { PickupDetailCard } from "@/components/shared/pickup-detail-card";
import { PickupTimeline } from "@/components/shared/pickup-timeline";
import { ArrowLeft, Phone, Truck, XCircle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { TripCard } from "@/components/shared/trip-card";
import { RatingForm, RatingDisplay } from "@/components/shared/rating-form";
import type { Pickup, PickupEvent, PickupTrip } from "@/types";

export default function PickupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: userLoading } = useUser();
  const supabase = createClient();

  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [events, setEvents] = useState<(PickupEvent & { profile_name?: string })[]>([]);
  const [vehicleRegNumber, setVehicleRegNumber] = useState<string | null>(null);
  const [driverPhone, setDriverPhone] = useState<string | null>(null);
  const [farmerName, setFarmerName] = useState<string | null>(null);
  const [trips, setTrips] = useState<PickupTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [ratings, setRatings] = useState<{ id: string; rating: number; comment: string | null; role: string; created_at: string }[]>([]);
  const [hasUserRated, setHasUserRated] = useState(false);

  const refetchTrips = useCallback(async () => {
    const { data } = await supabase
      .from("pickup_trips")
      .select("*")
      .eq("pickup_id", id)
      .order("trip_number", { ascending: true });
    if (data) setTrips(data as unknown as PickupTrip[]);
  }, [supabase, id]);

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

  // Realtime: pickup updates
  useRealtime({
    table: "pickups",
    filter: `id=eq.${id}`,
    event: "UPDATE",
    channelName: `bwg-pickup-${id}`,
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
    channelName: `bwg-pickup-events-${id}`,
    onData: () => {
      refetchEvents();
    },
  });

  // Realtime: trip updates
  useRealtime({
    table: "pickup_trips",
    filter: `pickup_id=eq.${id}`,
    event: "*",
    channelName: `bwg-pickup-trips-${id}`,
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

      // Fetch events with changer names
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

      // Fetch vehicle/farmer info
      if (pickupData.vehicle_id) {
        const { data } = await supabase
          .from("vehicles")
          .select("registration_number")
          .eq("id", pickupData.vehicle_id)
          .single();
        if (data) setVehicleRegNumber(data.registration_number);

        // Fetch driver phone via vehicle_drivers
        const { data: vdData } = await supabase
          .from("vehicle_drivers")
          .select("drivers(phone)")
          .eq("vehicle_id", pickupData.vehicle_id)
          .limit(1)
          .maybeSingle();
        if (vdData) {
          const driver = vdData.drivers as unknown as { phone: string } | null;
          if (driver?.phone) setDriverPhone(driver.phone);
        }
      }
      if (pickupData.farmer_id) {
        const { data } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", pickupData.farmer_id)
          .single();
        if (data) setFarmerName(data.full_name);
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
        .select("id, rating, comment, role, created_at, rated_by")
        .eq("pickup_id", id)
        .order("created_at", { ascending: true });
      if (ratingsData) {
        setRatings(ratingsData);
        setHasUserRated(ratingsData.some((r) => r.rated_by === user!.id));
      }

      setLoading(false);
    }
    fetchData();
  }, [user, id, supabase]);

  async function handleCancel() {
    if (!user || !pickup) return;
    if (pickup.status !== "requested") {
      toast.error("Only unverified pickups can be cancelled");
      return;
    }
    if (!window.confirm("Cancel this pickup request? This cannot be undone.")) {
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
      notes: "Cancelled by BWG",
    });

    fetch("/api/notify/pickup-cancelled", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pickupId: pickup.id }),
    }).catch(console.error);

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
          <Link href="/dashboard/bwg/pickups">
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
          <div className="flex items-center gap-2">
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
            <Button variant="outline" asChild>
              <Link href="/dashboard/bwg/pickups">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <PickupDetailCard
          pickup={pickup}
          vehicleRegNumber={vehicleRegNumber}
          farmerName={farmerName}
        />
        <PickupTimeline events={events} />
      </div>

      {pickup.vehicle_id && (vehicleRegNumber || driverPhone) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Collector Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {vehicleRegNumber && (
              <div className="flex items-center gap-2 text-sm">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Vehicle:</span>
                <span className="font-medium">{vehicleRegNumber}</span>
              </div>
            )}
            {driverPhone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Driver:</span>
                <a href={`tel:${driverPhone}`} className="font-medium text-primary underline">
                  {driverPhone}
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <PhotoDisplay
        beforeUrl={pickup.photo_before_url}
        afterUrl={pickup.photo_after_url}
      />

      {pickup.waste_photo_urls.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Waste Photos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 flex-wrap">
                {pickup.waste_photo_urls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-32 w-32 rounded-md overflow-hidden border hover:ring-2 ring-primary transition-all"
                  >
                    <img
                      src={url}
                      alt={`Waste photo ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      <TripCard trips={trips} />

      <RatingDisplay ratings={ratings} />

      {["arrived_processor", "accepted", "processed"].includes(pickup.status) && !hasUserRated && user && (
        <RatingForm
          pickupId={pickup.id}
          userId={user.id}
          role="bwg"
          onSubmitted={async () => {
            setHasUserRated(true);
            const { data } = await supabase
              .from("pickup_ratings")
              .select("id, rating, comment, role, created_at")
              .eq("pickup_id", id)
              .order("created_at", { ascending: true });
            if (data) setRatings(data);
          }}
        />
      )}

    </div>
  );
}
