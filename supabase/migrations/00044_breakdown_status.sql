-- Collector reported vehicle breakdown en route to BWG (after driver accepted).
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'breakdown';
