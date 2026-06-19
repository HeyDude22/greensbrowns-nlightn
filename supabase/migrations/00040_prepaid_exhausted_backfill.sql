-- Backfill packages that are fully used but still marked approved
UPDATE prepaid_packages
SET status = 'exhausted'
WHERE status = 'approved'
  AND used_count >= pickup_count;

-- Consume credit and mark package exhausted when all credits are used
CREATE OR REPLACE FUNCTION consume_pickup_prepaid_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.prepaid_package_id IS NOT NULL THEN
    UPDATE prepaid_packages
    SET
      used_count = used_count + 1,
      status = CASE
        WHEN used_count + 1 >= pickup_count THEN 'exhausted'::prepaid_package_status
        ELSE status
      END
    WHERE id = NEW.prepaid_package_id
      AND status = 'approved'
      AND expires_at > now()
      AND used_count < pickup_count;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient prepaid credits';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Restore credit; re-activate exhausted packages when credits become available again
CREATE OR REPLACE FUNCTION restore_pickup_prepaid_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NEW.prepaid_package_id IS NOT NULL THEN
    UPDATE prepaid_packages
    SET
      used_count = GREATEST(used_count - 1, 0),
      status = CASE
        WHEN GREATEST(used_count - 1, 0) < pickup_count
             AND (expires_at IS NULL OR expires_at > now())
             AND status IN ('approved', 'exhausted')
        THEN 'approved'::prepaid_package_status
        ELSE status
      END
    WHERE id = NEW.prepaid_package_id;
  END IF;

  RETURN NEW;
END;
$$;
