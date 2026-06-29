-- One-off (non-registered) WhatsApp pickups: guest identity store + sentinels.
--
-- Design: we do NOT create a new org/profile per guest (avoids org/profile
-- bloat). Instead every one-off pickup is attributed to a single system guest
-- org and a single system "WhatsApp Guest" profile (to satisfy NOT NULL foreign
-- keys on pickups.organization_id / pickups.requested_by), while the real
-- per-caller identity (name, org name, address, GSTIN, location) lives in
-- guest_requests, keyed by phone so returning guests can be recognized.

-- ---------------------------------------------------------------------------
-- 1. Guest identity store (one row per phone; updated on each return visit).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guest_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone          TEXT NOT NULL UNIQUE,
  requester_name TEXT,
  org_name       TEXT,
  address        TEXT,
  gstin          TEXT,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_requests_phone
  ON public.guest_requests(phone);

CREATE TRIGGER set_guest_requests_updated_at
  BEFORE UPDATE ON public.guest_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Accessed by the webhook handler via the service-role key (bypasses RLS).
-- Enable RLS with admin-only policy so no end user can read/write directly.
ALTER TABLE public.guest_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to guest_requests"
  ON public.guest_requests FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 2. Sentinel auth user -> system "WhatsApp Guest" profile.
--    Fixed UUIDs are mirrored in env: SYSTEM_GUEST_PROFILE_ID.
--    Inserting auth.users fires on_auth_user_created -> handle_new_user(),
--    which auto-creates public.profiles (role 'bwg', full_name from metadata).
--    NEVER delete this row: profiles.id and pickups.requested_by cascade off it.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-0000000000aa',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  '{"provider":"system","providers":["system"]}'::jsonb,
  '{"full_name":"WhatsApp Guest System"}'::jsonb,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Safety net: ensure the profile exists with the expected name even if the row
-- predated this migration or the trigger metadata differed.
INSERT INTO public.profiles (id, full_name, role, city)
VALUES ('00000000-0000-0000-0000-0000000000aa', 'WhatsApp Guest System', 'bwg', 'Bengaluru')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- ---------------------------------------------------------------------------
-- 3. System guest organization for one-off pickups.
--    Fixed UUID mirrored in env: SYSTEM_GUEST_ORG_ID.
-- ---------------------------------------------------------------------------
INSERT INTO public.organizations (id, name, org_type, address, city, is_active)
VALUES (
  '00000000-0000-0000-0000-0000000000bb',
  'WhatsApp Guest (One-Off)',
  'rwa',
  'N/A',
  'Bengaluru',
  true
)
ON CONFLICT (id) DO NOTHING;
