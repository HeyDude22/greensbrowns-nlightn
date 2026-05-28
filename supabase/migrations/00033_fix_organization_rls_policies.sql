-- Fix organization RLS for BWG onboarding (applied manually on existing projects)

-- 1. Remove self-referential SELECT on organization_members (caused infinite recursion)
DROP POLICY IF EXISTS "Members can view own org memberships" ON public.organization_members;

CREATE POLICY "Members can view own org memberships"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2. Allow reading organizations during create flow (before membership row exists)
DROP POLICY IF EXISTS "Authenticated users can view orgs without members" ON public.organizations;

CREATE POLICY "Authenticated users can view orgs without members"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organizations.id
    )
  );
