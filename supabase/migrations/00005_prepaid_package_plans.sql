-- Create prepaid package plans table for admin-defined plan templates
CREATE TABLE prepaid_package_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pickup_count integer NOT NULL,
  validity_days integer NOT NULL,
  price_paise integer NOT NULL,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE prepaid_package_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans" ON prepaid_package_plans
  FOR SELECT TO authenticated USING (is_active = true OR get_user_role() = 'admin');

CREATE POLICY "Admins can manage plans" ON prepaid_package_plans
  FOR ALL TO authenticated USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');

CREATE TRIGGER update_prepaid_package_plans_updated_at
  BEFORE UPDATE ON prepaid_package_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- BWG prepaid package requests (plan_id added in 00006)
CREATE TYPE prepaid_package_status AS ENUM (
  'pending', 'approved', 'rejected', 'expired'
);

CREATE TABLE prepaid_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  approved_by uuid REFERENCES profiles(id),
  pickup_count integer NOT NULL,
  used_count integer NOT NULL DEFAULT 0,
  status prepaid_package_status NOT NULL DEFAULT 'pending',
  notes text,
  approved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prepaid_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view org prepaid packages"
  ON prepaid_packages FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can request prepaid packages"
  ON prepaid_packages FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all prepaid packages"
  ON prepaid_packages FOR ALL TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE TRIGGER update_prepaid_packages_updated_at
  BEFORE UPDATE ON prepaid_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
