-- BWG pickup workflow statuses (app uses requested → verified → assigned → …)
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'requested';
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'verified' AFTER 'requested';
