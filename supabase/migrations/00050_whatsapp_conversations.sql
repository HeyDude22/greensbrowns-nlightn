-- Stateful WhatsApp conversation tracking for BWG self-service flows
-- (new pickup creation + pickup status lookup over WhatsApp).
--
-- One in-flight conversation per phone number. `flow` identifies the journey
-- (e.g. 'new_pickup', 'pickup_status'), `step` the current prompt the user is
-- expected to answer, and `data` accumulates collected answers (org id, date,
-- slot, uploaded photo urls, etc.). Rows are short-lived: `expires_at` lets the
-- handler treat abandoned conversations as fresh starts.

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL UNIQUE,
  profile_id  UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  flow        TEXT NOT NULL,
  step        TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 hour'
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_phone
  ON public.whatsapp_conversations(phone);

CREATE TRIGGER set_whatsapp_conversations_updated_at
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Accessed only by the webhook handler via the service-role key (bypasses RLS).
-- Enable RLS with no public policies so no end user can read/write directly.
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to whatsapp_conversations"
  ON public.whatsapp_conversations FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
