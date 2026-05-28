-- Pickup columns used by BWG scheduling and farmer WhatsApp flows (missing from migration chain)

ALTER TABLE public.pickups
  ADD COLUMN IF NOT EXISTS loading_helper_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waste_photo_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prepaid_package_id UUID REFERENCES public.prepaid_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS farmer_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_pickups_prepaid_package_id ON public.pickups(prepaid_package_id);

-- Farmer WhatsApp / admin verification workflow statuses
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'received';
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'rejected';
