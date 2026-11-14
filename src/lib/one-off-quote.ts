/**
 * Suggested price for a one-off (guest) pickup (UAT-4).
 *
 * The price covers that one pickup: the cheapest vehicle type that can carry
 * the pickup's weight and volume, charged its base fare plus its rate per km
 * times the road distance from the processor to the pickup point.
 *
 * Pure function — no Supabase, no network.
 */
import type { VehicleType } from "@/types";

export interface QuoteVehicleType {
  vehicleType: VehicleType;
  baseFareRs: number;
  perKmRs: number;
  /** Largest capacity among active vehicles of this type. */
  capacityKg: number;
  capacityM3: number | null;
}

export interface SuggestedPrice {
  vehicleType: VehicleType;
  /** 1 when one vehicle can carry it; more only when no vehicle type is big enough. */
  trips: number;
  priceRs: number;
}

export function suggestOneOffPrice(
  distanceKm: number,
  weightKg: number,
  volumeM3: number,
  vehicleTypes: QuoteVehicleType[],
): SuggestedPrice | null {
  const priced = vehicleTypes
    .filter((v) => v.capacityKg > 0)
    .map((v) => {
      const tripsByWeight = Math.ceil(weightKg / v.capacityKg);
      const tripsByVolume = v.capacityM3 && v.capacityM3 > 0 ? Math.ceil(volumeM3 / v.capacityM3) : 1;
      const trips = Math.max(tripsByWeight, tripsByVolume, 1);
      return {
        vehicleType: v.vehicleType,
        trips,
        priceRs: Math.round(trips * (v.baseFareRs + v.perKmRs * distanceKm)),
      };
    });

  if (!priced.length) return null;

  // Prefer vehicle types that carry it in one trip; among those, the cheapest.
  const oneTrip = priced.filter((p) => p.trips === 1);
  const pool = oneTrip.length ? oneTrip : priced;
  return pool.reduce((best, p) => (p.priceRs < best.priceRs ? p : best));
}
