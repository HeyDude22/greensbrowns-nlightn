-- Driver did not accept assigned job within SLA (120 minutes).
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'driver_not_accepted';
