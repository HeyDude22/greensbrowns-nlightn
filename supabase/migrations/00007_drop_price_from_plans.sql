ALTER TABLE prepaid_package_plans DROP COLUMN price_paise;

-- Org IDs for the current user (used by RLS policies in 00008+)
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid();
$$;
