-- Organization no-show tracking and activation state.
-- no_show_count starts NULL (no offences yet); 1, 2, 3 mark escalating offences.
-- is_active gates scheduling pickups and purchasing plans (login is never blocked).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS no_show_count INTEGER,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Safety net: block new pickups for suspended organizations even if credits exist.
CREATE OR REPLACE FUNCTION public.block_inactive_org_pickup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM organizations
    WHERE id = NEW.organization_id AND is_active = false
  ) THEN
    RAISE EXCEPTION 'Organization is suspended and cannot schedule pickups';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_inactive_org_pickup ON public.pickups;
CREATE TRIGGER trg_block_inactive_org_pickup
  BEFORE INSERT ON public.pickups
  FOR EACH ROW
  EXECUTE FUNCTION public.block_inactive_org_pickup();

-- Safety net: block plan purchase requests for suspended organizations.
CREATE OR REPLACE FUNCTION public.block_inactive_org_prepaid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM organizations
    WHERE id = NEW.organization_id AND is_active = false
  ) THEN
    RAISE EXCEPTION 'Organization is suspended and cannot purchase plans';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_inactive_org_prepaid ON public.prepaid_packages;
CREATE TRIGGER trg_block_inactive_org_prepaid
  BEFORE INSERT ON public.prepaid_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.block_inactive_org_prepaid();
