-- New pickup lifecycle statuses (processor acceptance uses "accepted", not "received").
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'driver_accepted';
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'enroute';
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'arrived_bwg';
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'full_pickup';
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'partial_pickup';
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'arrived_processor';
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'accepted';
