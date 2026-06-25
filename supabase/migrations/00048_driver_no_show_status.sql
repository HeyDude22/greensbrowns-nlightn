-- Driver no-show: accepted the job but never marked Arrived by the slot deadline.
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'driver_no_show';
