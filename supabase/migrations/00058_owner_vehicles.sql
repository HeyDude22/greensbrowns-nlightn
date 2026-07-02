-- Add owner_id to vehicles table
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS owner_id UUID
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- Index for fast owner lookups
CREATE INDEX IF NOT EXISTS idx_vehicles_owner_id
  ON vehicles(owner_id);