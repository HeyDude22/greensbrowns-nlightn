-- Admin-created drivers use auth.users.id as drivers.id (collector accounts).
-- Existing seed drivers keep random UUIDs until re-saved via admin (NOT VALID FK).

ALTER TABLE public.drivers
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_id_auth_users_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
