-- Storage buckets used by the app (only vehicle-docs existed in 00011)

INSERT INTO storage.buckets (id, name, public) VALUES
  ('compliance-docs', 'compliance-docs', false),
  ('pickup-photos', 'pickup-photos', true),
  ('kyc-documents', 'kyc-documents', false),
  ('org-documents', 'org-documents', true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- compliance-docs  ({orgId}/service-agreement-*.pdf, etc.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Org members manage compliance docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins full access compliance docs" ON storage.objects;

CREATE POLICY "Org members manage compliance docs"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'compliance-docs'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'compliance-docs'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins full access compliance docs"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'compliance-docs' AND get_user_role() = 'admin')
  WITH CHECK (bucket_id = 'compliance-docs' AND get_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- pickup-photos  ({orgId}/*.jpg, {pickupId}/*.jpg, pickup-photos/{pickupId}/*)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Pickup photo uploads" ON storage.objects;
DROP POLICY IF EXISTS "Admins full access pickup photos" ON storage.objects;

CREATE POLICY "Pickup photo uploads"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'pickup-photos'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM public.organization_members
        WHERE user_id = auth.uid()
      )
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.pickups WHERE requested_by = auth.uid()
      )
      OR (storage.foldername(name))[1] IN (
        SELECT p.id::text
        FROM public.pickups p
        WHERE p.organization_id IN (
          SELECT organization_id
          FROM public.organization_members
          WHERE user_id = auth.uid()
        )
      )
      OR (storage.foldername(name))[1] = 'pickup-photos'
    )
  );

CREATE POLICY "Admins full access pickup photos"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'pickup-photos' AND get_user_role() = 'admin')
  WITH CHECK (bucket_id = 'pickup-photos' AND get_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- kyc-documents  ({userId}/* or kyc-documents/{userId}/*)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users manage own KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins full access KYC docs" ON storage.objects;

CREATE POLICY "Users manage own KYC docs"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  )
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );

CREATE POLICY "Admins full access KYC docs"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'kyc-documents' AND get_user_role() = 'admin')
  WITH CHECK (bucket_id = 'kyc-documents' AND get_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- org-documents  ({orgId}/contract-*.pdf — admin uploads)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage org documents" ON storage.objects;

CREATE POLICY "Admins manage org documents"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'org-documents' AND get_user_role() = 'admin')
  WITH CHECK (bucket_id = 'org-documents' AND get_user_role() = 'admin');
