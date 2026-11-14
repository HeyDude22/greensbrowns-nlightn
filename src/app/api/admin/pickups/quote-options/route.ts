import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/supabase/admin";
import { getRoadDistancesKm } from "@/lib/google/distance-matrix";
import { haversineKm } from "@/lib/job-optimizer";
import { suggestOneOffPrice, type QuoteVehicleType } from "@/lib/one-off-quote";
import { GREEN_WASTE_DENSITY_KG_PER_M3, VEHICLE_TYPE_LABELS } from "@/lib/constants";
import type { VehicleType } from "@/types";

/**
 * Admin: processors for a one-off pickup's quote, nearest first, each with the
 * road distance to the pickup point and a suggested price (UAT-4).
 */
export async function GET(req: NextRequest) {
  const { admin, error: authError } = await verifyAdmin();
  if (authError || !admin) {
    return NextResponse.json({ error: authError ?? "Unauthorized" }, { status: 401 });
  }

  const pickupId = req.nextUrl.searchParams.get("pickupId");
  if (!pickupId) {
    return NextResponse.json({ error: "pickupId is required" }, { status: 400 });
  }

  const { data: pickup, error: pickupErr } = await admin
    .from("pickups")
    .select("id, is_one_off, farmer_id, estimated_weight_kg, estimated_volume_m3, pickup_lat, pickup_lng")
    .eq("id", pickupId)
    .single();

  if (pickupErr || !pickup) {
    return NextResponse.json({ error: "Pickup not found" }, { status: 404 });
  }
  if (!pickup.is_one_off) {
    return NextResponse.json({ error: "Quotes are only for one-off pickups" }, { status: 400 });
  }
  if (pickup.pickup_lat == null || pickup.pickup_lng == null) {
    return NextResponse.json(
      { error: "The guest has not shared a pickup location, so distance can't be calculated." },
      { status: 400 },
    );
  }

  const [farmerResult, rateResult, vehicleResult] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, farmer_details(farm_name, farm_lat, farm_lng, is_active)")
      .eq("role", "farmer"),
    admin.from("vehicle_type_rates").select("vehicle_type, base_fare_rs, per_km_rs"),
    admin.from("vehicles").select("vehicle_type, capacity_kg, volume_capacity_m3").eq("is_active", true),
  ]);

  type FarmerDetails = {
    farm_name: string | null;
    farm_lat: number | null;
    farm_lng: number | null;
    is_active: boolean | null;
  };

  const processors = (farmerResult.data ?? [])
    .map((f) => {
      const raw = f.farmer_details as unknown as FarmerDetails | FarmerDetails[] | null;
      const details = Array.isArray(raw) ? raw[0] : raw;
      return {
        id: f.id as string,
        name: (details?.farm_name || f.full_name || "Processor") as string,
        lat: details?.farm_lat ?? null,
        lng: details?.farm_lng ?? null,
        active: details?.is_active !== false,
      };
    })
    .filter((p): p is typeof p & { lat: number; lng: number } => p.active && p.lat != null && p.lng != null);

  // Capacity per vehicle type = the largest active vehicle of that type (as the job optimizer does).
  const capacity: Partial<Record<VehicleType, { kg: number; m3: number | null }>> = {};
  for (const v of vehicleResult.data ?? []) {
    const type = v.vehicle_type as VehicleType;
    const existing = capacity[type];
    if (!existing || v.capacity_kg > existing.kg) {
      capacity[type] = { kg: v.capacity_kg, m3: v.volume_capacity_m3 };
    }
  }
  const vehicleTypes: QuoteVehicleType[] = (rateResult.data ?? [])
    .filter((r) => capacity[r.vehicle_type as VehicleType])
    .map((r) => {
      const cap = capacity[r.vehicle_type as VehicleType]!;
      return {
        vehicleType: r.vehicle_type as VehicleType,
        baseFareRs: Number(r.base_fare_rs),
        perKmRs: Number(r.per_km_rs),
        capacityKg: cap.kg,
        capacityM3: cap.m3,
      };
    });

  const origin = { lat: pickup.pickup_lat, lng: pickup.pickup_lng };
  const roadKm = await getRoadDistancesKm(origin, processors);

  const weightKg = pickup.estimated_weight_kg ?? 0;
  const volumeM3 = pickup.estimated_volume_m3 ?? weightKg / GREEN_WASTE_DENSITY_KG_PER_M3;

  const options = processors
    .map((p, i) => {
      const road = roadKm[i];
      const distanceKm = road ?? Math.round(haversineKm(origin, p) * 10) / 10;
      const price = suggestOneOffPrice(distanceKm, weightKg, volumeM3, vehicleTypes);
      return {
        id: p.id,
        name: p.name,
        distanceKm,
        distanceIsEstimate: road == null,
        suggestedPriceRs: price?.priceRs ?? null,
        vehicleType: price?.vehicleType ?? null,
        vehicleLabel: price ? VEHICLE_TYPE_LABELS[price.vehicleType] : null,
        trips: price?.trips ?? null,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return NextResponse.json({
    processors: options,
    selectedProcessorId: pickup.farmer_id,
    pricingAvailable: vehicleTypes.length > 0,
  });
}
