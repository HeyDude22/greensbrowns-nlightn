-- Razorpay payment flow for one-off (guest) pickups.
--
-- The pickup status is NOT changed to a 'quoted' value: a one-off pickup stays
-- 'requested' until payment is confirmed, then flips straight to 'verified'
-- (done by the Razorpay webhook). The payment lifecycle lives entirely on
-- payments.status: awaiting_quote -> quoted -> paid | failed | refunded.
--
-- Adds the Razorpay identifiers needed to (a) look up a payment from a webhook
-- by the payment-link id, (b) record the captured payment id, and (c) cancel a
-- stale link before re-sending a new one.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS razorpay_payment_link_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id      TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason           TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_link_id
  ON public.payments(razorpay_payment_link_id);
