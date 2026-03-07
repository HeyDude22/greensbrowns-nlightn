const API_KEY = process.env.GOOGLE_MAPS_API_KEY!;
const BASE_URL = "https://maps.googleapis.com/maps/api/distancematrix/json";

interface DistanceResult {
  durationMinutes: number;
  durationText: string;
  distanceKm: number;
  distanceText: string;
}

export async function getETA(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<DistanceResult | null> {
  try {
    const params = new URLSearchParams({
      origins: `${originLat},${originLng}`,
      destinations: `${destLat},${destLng}`,
      departure_time: "now",
      traffic_model: "best_guess",
      key: API_KEY,
    });

    const res = await fetch(`${BASE_URL}?${params}`);
    const data = await res.json();

    if (data.status !== "OK") {
      console.error("[DistanceMatrix] API error:", data.status, data.error_message);
      return null;
    }

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") {
      console.error("[DistanceMatrix] Element error:", element?.status);
      return null;
    }

    const duration = element.duration_in_traffic || element.duration;

    return {
      durationMinutes: Math.round(duration.value / 60),
      durationText: duration.text,
      distanceKm: Math.round(element.distance.value / 1000),
      distanceText: element.distance.text,
    };
  } catch (error) {
    console.error("[DistanceMatrix] Fetch error:", error);
    return null;
  }
}

export function googleMapsLink(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}
