-- Legal / KYC fields on organizations for service agreement generation
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS registration_number TEXT,
  ADD COLUMN IF NOT EXISTS pan TEXT,
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS signatory_name TEXT,
  ADD COLUMN IF NOT EXISTS signatory_designation TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- BWG org members may insert their own service agreement record (one per org, no pickup)
CREATE POLICY "Org members can insert service agreement"
  ON public.compliance_docs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    doc_type = 'agreement'
    AND pickup_id IS NULL
    AND organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );
