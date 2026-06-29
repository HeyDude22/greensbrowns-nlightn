-- Abuse controls for inbound WhatsApp: phone blocklist + rate-limit event log.
-- Accessed only by the webhook handler via the service-role key (bypasses RLS).
-- RLS is enabled with admin-only policies so no end user can read/write directly.

-- Phones an admin has blocked from interacting over WhatsApp.
CREATE TABLE IF NOT EXISTS public.whatsapp_blocked_phones (
  phone       TEXT PRIMARY KEY,
  reason      TEXT,
  blocked_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only log of rate-limited actions, used for sliding-window counting.
-- `kind` examples: 'message' (any inbound), 'one_off_created' (guest pickup).
CREATE TABLE IF NOT EXISTS public.whatsapp_rate_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT NOT NULL,
  kind       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_rate_events_phone_kind_time
  ON public.whatsapp_rate_events(phone, kind, created_at);

CREATE INDEX IF NOT EXISTS idx_wa_rate_events_kind_time
  ON public.whatsapp_rate_events(kind, created_at);

ALTER TABLE public.whatsapp_blocked_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_rate_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to whatsapp_blocked_phones"
  ON public.whatsapp_blocked_phones FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins full access to whatsapp_rate_events"
  ON public.whatsapp_rate_events FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
