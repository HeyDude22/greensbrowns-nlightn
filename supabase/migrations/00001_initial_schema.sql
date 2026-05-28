-- GreensBrowns Initial Schema Migration
-- Digital circular marketplace for leafy & horticulture waste

-- ============================================
-- 1. Extensions
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================
-- 2. Custom Enums
-- ============================================
CREATE TYPE user_role AS ENUM ('bwg', 'collector', 'farmer', 'admin');
CREATE TYPE kyc_status AS ENUM ('pending', 'submitted', 'verified', 'rejected');
CREATE TYPE org_type AS ENUM ('apartment', 'rwa', 'techpark');
CREATE TYPE pickup_status AS ENUM ('scheduled', 'assigned', 'picked_up', 'in_transit', 'delivered', 'processed', 'cancelled');
CREATE TYPE recurrence_type AS ENUM ('one_time', 'weekly', 'biweekly', 'monthly');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled');
CREATE TYPE compliance_doc_type AS ENUM ('manifest', 'receipt', 'certificate', 'report');
CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE vehicle_type AS ENUM ('auto', 'mini_truck', 'truck', 'tempo');

-- ============================================
-- 3. Tables
-- ============================================

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'bwg',
  full_name TEXT,
  phone TEXT,
  email TEXT,
  avatar_url TEXT,
  kyc_status kyc_status NOT NULL DEFAULT 'pending',
  city TEXT NOT NULL DEFAULT 'Bengaluru',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  org_type org_type NOT NULL,
  address TEXT NOT NULL,
  ward TEXT,
  city TEXT NOT NULL DEFAULT 'Bengaluru',
  pincode TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  contact_name TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Organization Members (junction table)
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Vehicles
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  registration_number TEXT UNIQUE NOT NULL,
  vehicle_type vehicle_type NOT NULL,
  capacity_kg INTEGER NOT NULL DEFAULT 500,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pickup number sequence
CREATE SEQUENCE pickup_number_seq START 1;

-- Pickups (core table)
CREATE TABLE pickups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_number TEXT UNIQUE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id),
  collector_id UUID REFERENCES profiles(id),
  farmer_id UUID REFERENCES profiles(id),
  vehicle_id UUID REFERENCES vehicles(id),
  status pickup_status NOT NULL DEFAULT 'scheduled',
  scheduled_date DATE NOT NULL,
  scheduled_slot TEXT,
  recurrence recurrence_type NOT NULL DEFAULT 'one_time',
  estimated_weight_kg NUMERIC,
  actual_weight_kg NUMERIC,
  photo_before_url TEXT,
  photo_after_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pickup Events (append-only audit trail)
CREATE TABLE pickup_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_id UUID NOT NULL REFERENCES pickups(id) ON DELETE CASCADE,
  status pickup_status NOT NULL,
  changed_by UUID NOT NULL REFERENCES profiles(id),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Compliance Documents
CREATE TABLE compliance_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_id UUID REFERENCES pickups(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  doc_type compliance_doc_type NOT NULL,
  file_url TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pickup_id UUID REFERENCES pickups(id) ON DELETE SET NULL,
  amount_paise INTEGER NOT NULL,
  tax_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER GENERATED ALWAYS AS (amount_paise + tax_paise) STORED,
  status payment_status NOT NULL DEFAULT 'pending',
  due_date DATE,
  paid_at TIMESTAMPTZ,
  razorpay_payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  plan TEXT NOT NULL DEFAULT 'basic',
  price_paise INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Support Tickets
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT,
  status ticket_status NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 4. Functions
-- ============================================

-- Get current user's role (for RLS policies)
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, phone, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'bwg')
  );
  RETURN NEW;
END;
$$;

-- Generate pickup number (GB-YYYYMMDD-XXXX)
CREATE OR REPLACE FUNCTION generate_pickup_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.pickup_number := 'GB-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('pickup_number_seq')::text, 4, '0');
  RETURN NEW;
END;
$$;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================
-- 5. Triggers
-- ============================================

-- Auto-create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-generate pickup number
CREATE TRIGGER set_pickup_number
  BEFORE INSERT ON pickups
  FOR EACH ROW EXECUTE FUNCTION generate_pickup_number();

-- Auto-update updated_at on all mutable tables
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_pickups_updated_at
  BEFORE UPDATE ON pickups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 6. Row Level Security
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickups ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (get_user_role() = 'admin');

-- Organizations policies
CREATE POLICY "Org members can view their organization"
  ON organizations FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- BWG onboarding: allow INSERT … RETURNING before organization_members row exists
CREATE POLICY "Authenticated users can view orgs without members"
  ON organizations FOR SELECT
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id
    )
  );

CREATE POLICY "Admins can manage all organizations"
  ON organizations FOR ALL
  USING (get_user_role() = 'admin');

-- Organization Members policies
CREATE POLICY "Members can view own org memberships"
  ON organization_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all memberships"
  ON organization_members FOR ALL
  USING (get_user_role() = 'admin');

-- Vehicles policies
CREATE POLICY "Owners can manage own vehicles"
  ON vehicles FOR ALL
  USING (owner_id = auth.uid());

CREATE POLICY "Admins can view all vehicles"
  ON vehicles FOR SELECT
  USING (get_user_role() = 'admin');

-- Pickups policies
CREATE POLICY "BWGs can view own org pickups"
  ON pickups FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "BWGs can create pickups for own org"
  ON pickups FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
    AND requested_by = auth.uid()
  );

CREATE POLICY "Collectors can view assigned pickups"
  ON pickups FOR SELECT
  USING (collector_id = auth.uid());

CREATE POLICY "Collectors can update assigned pickups"
  ON pickups FOR UPDATE
  USING (collector_id = auth.uid());

CREATE POLICY "Farmers can view assigned pickups"
  ON pickups FOR SELECT
  USING (farmer_id = auth.uid());

CREATE POLICY "Admins can manage all pickups"
  ON pickups FOR ALL
  USING (get_user_role() = 'admin');

-- Pickup Events policies
CREATE POLICY "Participants can view pickup events"
  ON pickup_events FOR SELECT
  USING (
    pickup_id IN (
      SELECT id FROM pickups
      WHERE requested_by = auth.uid()
        OR collector_id = auth.uid()
        OR farmer_id = auth.uid()
        OR organization_id IN (
          SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Participants can create pickup events"
  ON pickup_events FOR INSERT
  WITH CHECK (
    changed_by = auth.uid()
    AND pickup_id IN (
      SELECT id FROM pickups
      WHERE requested_by = auth.uid()
        OR collector_id = auth.uid()
        OR farmer_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all pickup events"
  ON pickup_events FOR ALL
  USING (get_user_role() = 'admin');

-- Compliance Docs policies
CREATE POLICY "Org members can view own compliance docs"
  ON compliance_docs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all compliance docs"
  ON compliance_docs FOR ALL
  USING (get_user_role() = 'admin');

-- Invoices policies
CREATE POLICY "Org members can view own invoices"
  ON invoices FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all invoices"
  ON invoices FOR ALL
  USING (get_user_role() = 'admin');

-- Subscriptions policies
CREATE POLICY "Org members can view own subscription"
  ON subscriptions FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all subscriptions"
  ON subscriptions FOR ALL
  USING (get_user_role() = 'admin');

-- Support Tickets policies
CREATE POLICY "Users can manage own tickets"
  ON support_tickets FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all tickets"
  ON support_tickets FOR ALL
  USING (get_user_role() = 'admin');

-- ============================================
-- 7. Indexes
-- ============================================

CREATE INDEX idx_pickups_organization_id ON pickups(organization_id);
CREATE INDEX idx_pickups_collector_id ON pickups(collector_id);
CREATE INDEX idx_pickups_farmer_id ON pickups(farmer_id);
CREATE INDEX idx_pickups_status ON pickups(status);
CREATE INDEX idx_pickup_events_pickup_id ON pickup_events(pickup_id);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX idx_org_members_org_id ON organization_members(organization_id);

-- ============================================
-- 8. Realtime
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE pickups;
ALTER PUBLICATION supabase_realtime ADD TABLE pickup_events;
