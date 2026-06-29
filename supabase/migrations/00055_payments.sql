-- Payment details for pickups, kept separate from the pickups table.
--
-- Used by the one-off (guest) pickup flow now; the quote/QR/Razorpay flow is
-- built in a later phase. One payment row per pickup (UNIQUE pickup_id).
--
-- `status` is TEXT (not the existing payment_status enum) so it can carry the
-- one-off lifecycle value 'awaiting_quote': awaiting_quote -> quoted -> paid,
-- plus 'cancelled' / 'refunded'.

CREATE TABLE IF NOT EXISTS public.payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_id        UUID NOT NULL UNIQUE REFERENCES public.pickups(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'awaiting_quote',
  quote_amount_rs  NUMERIC,
  quoted_at        TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  provider         TEXT,            -- 'manual_qr' | 'razorpay'
  payment_ref      TEXT,
  payment_link_url TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_pickup_id
  ON public.payments(pickup_id);

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON public.payments(status);

CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Written by the webhook handler via the service-role key (bypasses RLS).
-- Admins manage payments from the dashboard; no other role has access.
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to payments"
  ON public.payments FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
