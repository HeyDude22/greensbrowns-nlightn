-- Make nearby_pending_pickups location-aware for one-off pickups: they belong
-- to the system guest org (which has no lat/lng), so fall back to the pickup's own
-- coordinates (pickup_lat/pickup_lng) captured from the guest's WhatsApp pin.

DROP FUNCTION IF EXISTS public.nearby_pending_pickups(double precision, double precision, double precision);

CREATE FUNCTION public.nearby_pending_pickups(
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  pickup_number TEXT,
  organization_id UUID,
  estimated_weight_kg NUMERIC,
  estimated_volume_m3 NUMERIC,
  scheduled_date DATE,
  scheduled_slot TEXT,
  org_name TEXT,
  org_address TEXT,
  org_type TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  distance_km DOUBLE PRECISION
) AS $$
  SELECT p.id, p.pickup_number, p.organization_id,
         p.estimated_weight_kg, p.estimated_volume_m3, p.scheduled_date,
         p.scheduled_slot::text,
         CASE WHEN p.is_one_off THEN COALESCE(g.org_name, o.name) ELSE o.name END,
         CASE WHEN p.is_one_off THEN COALESCE(g.address, o.address) ELSE o.address END,
         o.org_type::text,
         COALESCE(p.pickup_lat, o.lat) AS lat,
         COALESCE(p.pickup_lng, o.lng) AS lng,
         ST_Distance(
           ST_MakePoint(COALESCE(p.pickup_lng, o.lng), COALESCE(p.pickup_lat, o.lat))::extensions.geography,
           ST_MakePoint(center_lng, center_lat)::extensions.geography
         ) / 1000.0 AS distance_km
  FROM public.pickups p
  JOIN public.organizations o ON o.id = p.organization_id
  LEFT JOIN public.guest_requests g ON g.id = p.guest_request_id
  WHERE p.status = 'verified'
    AND COALESCE(p.pickup_lat, o.lat) IS NOT NULL
    AND COALESCE(p.pickup_lng, o.lng) IS NOT NULL
    AND ST_DWithin(
      ST_MakePoint(COALESCE(p.pickup_lng, o.lng), COALESCE(p.pickup_lat, o.lat))::extensions.geography,
      ST_MakePoint(center_lng, center_lat)::extensions.geography,
      radius_km * 1000
    )
  ORDER BY distance_km;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions;
