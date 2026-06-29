-- One-off (non-registered) WhatsApp pickups: extend pickups with guest +
-- location + payment columns. Payment columns are added now for a stable data
-- model; the payment FLOW (quote / QR / Razorpay) is built in a later phase.
--
-- One-off pickups are attributed to the system guest org + system guest profile
-- (see 00052) and carry no prepaid_package_id, so the prepaid-credit trigger
-- (00038) is a no-op for them.

ALTER TABLE public.pickups
  ADD COLUMN IF NOT EXISTS is_one_off       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_status   TEXT,
  ADD COLUMN IF NOT EXISTS quote_amount_rs  NUMERIC,
  ADD COLUMN IF NOT EXISTS quoted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_ref      TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS pickup_lat       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pickup_lng       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS requester_name   TEXT,
  ADD COLUMN IF NOT EXISTS requester_phone  TEXT,
  ADD COLUMN IF NOT EXISTS guest_request_id UUID
    REFERENCES public.guest_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pickups_is_one_off
  ON public.pickups(is_one_off);

CREATE INDEX IF NOT EXISTS idx_pickups_requester_phone
  ON public.pickups(requester_phone);
