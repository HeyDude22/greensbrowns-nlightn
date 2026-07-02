"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, UserCheck, IndianRupee, Crown } from "lucide-react";
import { toast } from "sonner";
import type { Vehicle, VehicleDocument, Driver, VehicleTypeRate } from "@/types";

import { VehiclesTab } from "./_vehicles-tab";
import { DriversTab } from "./_drivers-tab";
import { RatesTab } from "./_rates-tab";
import { OwnersTab } from "./_owners-tab";

interface VehicleWithDetails extends Vehicle {
  vehicle_documents?: VehicleDocument[];
  vehicle_drivers?: { driver_id: string; drivers: Driver }[];
}

interface DriverWithVehicles extends Driver {
  vehicle_drivers?: { vehicle_id: string; vehicles: { id: string; registration_number: string } }[];
}

export default function AdminCollectorVehiclesPage() {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<VehicleWithDetails[]>([]);
  const [drivers, setDrivers] = useState<DriverWithVehicles[]>([]);
  const [rates, setRates] = useState<VehicleTypeRate[]>([]);
  const [owners, setOwners] = useState<{ id: string; full_name: string | null; email: string | null; phone: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVehicles = useCallback(async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*, vehicle_documents(*), vehicle_drivers(driver_id, drivers(*))")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load vehicles");
      console.error(error);
    }
    if (data) setVehicles(data as unknown as VehicleWithDetails[]);
  }, [supabase]);

  const fetchDrivers = useCallback(async () => {
    const { data, error } = await supabase
      .from("drivers")
      .select("*, vehicle_drivers(vehicle_id, vehicles(id, registration_number))")
      .order("name");

    if (error) {
      toast.error("Failed to load drivers");
      console.error(error);
    }
    if (data) setDrivers(data as unknown as DriverWithVehicles[]);
  }, [supabase]);

  const fetchRates = useCallback(async () => {
    const { data, error } = await supabase
      .from("vehicle_type_rates")
      .select("*")
      .order("base_fare_rs", { ascending: true });

    if (error) {
      toast.error("Failed to load rates");
      console.error(error);
    }
    if (data) setRates(data as unknown as VehicleTypeRate[]);
  }, [supabase]);

  const fetchOwners = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("role", "owner")
      .order("full_name");

    if (error) {
      toast.error("Failed to load owners");
      console.error(error);
    }
    if (data) setOwners(data);
  }, [supabase]);

  useEffect(() => {
    Promise.all([fetchVehicles(), fetchDrivers(), fetchRates(), fetchOwners()]).then(() =>
      setLoading(false)
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collector Vehicles"
        description="Register and manage vehicles, drivers, and rates"
      />

      <Tabs defaultValue="vehicles">
        <TabsList>
          <TabsTrigger value="vehicles">
            <Truck className="mr-2 h-4 w-4" /> Vehicles
          </TabsTrigger>
          <TabsTrigger value="drivers">
            <UserCheck className="mr-2 h-4 w-4" /> Drivers
          </TabsTrigger>
          <TabsTrigger value="rates">
            <IndianRupee className="mr-2 h-4 w-4" /> Rates
          </TabsTrigger>
          <TabsTrigger value="owners">
            <Crown className="mr-2 h-4 w-4" /> Owners
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles" className="mt-4">
          <VehiclesTab vehicles={vehicles} fetchVehicles={fetchVehicles} />
        </TabsContent>

        <TabsContent value="drivers" className="mt-4">
          <DriversTab
            drivers={drivers}
            vehicles={vehicles}
            fetchDrivers={fetchDrivers}
            fetchVehicles={fetchVehicles}
          />
        </TabsContent>

        <TabsContent value="rates" className="mt-4">
          <RatesTab rates={rates} fetchRates={fetchRates} />
        </TabsContent>

        <TabsContent value="owners" className="mt-4">
          <OwnersTab
            owners={owners}
            vehicles={vehicles}
            fetchOwners={fetchOwners}
            fetchVehicles={fetchVehicles}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
