-- One-off (non-registered) WhatsApp pickups: extend pickups with the minimal
-- fields needed for routing and guest attribution.
--
-- Requester identity (name, phone, org, address, GSTIN) lives in guest_requests
-- (linked via guest_request_id) and is NOT duplicated here. Payment details live
-- in the dedicated `payments` table (see 00055), not on the pickup.
--
-- One-off pickups are attributed to the system guest org + system guest profile
-- (see 00052) and carry no prepaid_package_id, so the prepaid-credit trigger
-- (00038) is a no-op for them. pickup_lat/lng snapshot the guest's shared pin so
-- routing stays correct even if the guest's saved location changes later.

ALTER TABLE public.pickups
  ADD COLUMN IF NOT EXISTS is_one_off       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pickup_lat       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pickup_lng       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS guest_request_id UUID
    REFERENCES public.guest_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pickups_is_one_off
  ON public.pickups(is_one_off);

CREATE INDEX IF NOT EXISTS idx_pickups_guest_request_id
  ON public.pickups(guest_request_id);
