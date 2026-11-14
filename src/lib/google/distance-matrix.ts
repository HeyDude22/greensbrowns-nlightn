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

/**
 * Road distance in km from one origin to many destinations (one API call,
 * up to 25 destinations). Entries are null where Google has no route or the
 * call fails, so callers can fall back to a straight-line estimate.
 */
export async function getRoadDistancesKm(
  origin: { lat: number; lng: number },
  destinations: { lat: number; lng: number }[],
): Promise<(number | null)[]> {
  if (!destinations.length) return [];
  if (!API_KEY) return destinations.map(() => null);
  try {
    const params = new URLSearchParams({
      origins: `${origin.lat},${origin.lng}`,
      destinations: destinations
        .slice(0, 25)
        .map((d) => `${d.lat},${d.lng}`)
        .join("|"),
      key: API_KEY,
    });

    const res = await fetch(`${BASE_URL}?${params}`);
    const data = await res.json();
    if (data.status !== "OK") {
      console.error("[DistanceMatrix] API error:", data.status, data.error_message);
      return destinations.map(() => null);
    }

    const elements = (data.rows?.[0]?.elements ?? []) as {
      status: string;
      distance?: { value: number };
    }[];
    return destinations.map((_, i) => {
      const el = elements[i];
      return el?.status === "OK" && el.distance
        ? Math.round((el.distance.value / 1000) * 10) / 10
        : null;
    });
  } catch (error) {
    console.error("[DistanceMatrix] Fetch error:", error);
    return destinations.map(() => null);
  }
}

export function googleMapsLink(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}
