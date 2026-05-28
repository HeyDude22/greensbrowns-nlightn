-- Jobs: batch dispatch of pickups to a vehicle + farmer destination

-- 1. Enum
CREATE TYPE public.job_status AS ENUM (
  'pending',
  'dispatched',
  'in_progress',
  'completed',
  'cancelled'
);

-- 2. Jobs table
CREATE TABLE public.jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number  TEXT NOT NULL,
  vehicle_id  UUID NOT NULL REFERENCES public.vehicles(id),
  farmer_id   UUID NOT NULL REFERENCES public.profiles(id),
  scheduled_date DATE NOT NULL,
  status      public.job_status NOT NULL DEFAULT 'pending',
  notes       TEXT,
  created_by  UUID NOT NULL REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Job-pickups join table
CREATE TABLE public.job_pickups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  pickup_id  UUID NOT NULL REFERENCES public.pickups(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Indexes
CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_jobs_scheduled_date ON public.jobs(scheduled_date);
CREATE INDEX idx_jobs_vehicle_id ON public.jobs(vehicle_id);
CREATE INDEX idx_job_pickups_job_id ON public.job_pickups(job_id);
CREATE INDEX idx_job_pickups_pickup_id ON public.job_pickups(pickup_id);

-- 5. Updated_at trigger
CREATE TRIGGER set_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 6. Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_pickups ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins full access to jobs"
  ON public.jobs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins full access to job_pickups"
  ON public.job_pickups FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Farmers can view jobs assigned to them
CREATE POLICY "Farmers view own jobs"
  ON public.jobs FOR SELECT
  USING (farmer_id = auth.uid());

CREATE POLICY "Farmers view own job_pickups"
  ON public.job_pickups FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_pickups.job_id AND jobs.farmer_id = auth.uid())
  );

-- 7. Nearby pending pickups function (uses PostGIS)
CREATE OR REPLACE FUNCTION public.nearby_pending_pickups(
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  pickup_number TEXT,
  organization_id UUID,
  estimated_weight_kg NUMERIC,
  scheduled_date DATE,
  org_name TEXT,
  org_address TEXT,
  org_type TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  distance_km DOUBLE PRECISION
) AS $$
  SELECT p.id, p.pickup_number, p.organization_id,
         p.estimated_weight_kg, p.scheduled_date,
         o.name, o.address, o.org_type::text,
         o.lat, o.lng,
         ST_Distance(
           ST_MakePoint(o.lng, o.lat)::extensions.geography,
           ST_MakePoint(center_lng, center_lat)::extensions.geography
         ) / 1000.0 AS distance_km
  FROM public.pickups p
  JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.status = 'scheduled'
    AND o.lat IS NOT NULL AND o.lng IS NOT NULL
    AND ST_DWithin(
      ST_MakePoint(o.lng, o.lat)::extensions.geography,
      ST_MakePoint(center_lng, center_lat)::extensions.geography,
      radius_km * 1000
    )
  ORDER BY distance_km;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions;
