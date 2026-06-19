-- Consume prepaid credit when a pickup is created with a linked package.
CREATE OR REPLACE FUNCTION consume_pickup_prepaid_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.prepaid_package_id IS NOT NULL THEN
    UPDATE prepaid_packages
    SET used_count = used_count + 1
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

CREATE TRIGGER trg_pickup_consume_prepaid_credit
  BEFORE INSERT ON pickups
  FOR EACH ROW
  EXECUTE FUNCTION consume_pickup_prepaid_credit();

-- Restore prepaid credit when a pickup is cancelled.
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
    SET used_count = GREATEST(used_count - 1, 0)
    WHERE id = NEW.prepaid_package_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pickup_restore_prepaid_credit
  AFTER UPDATE OF status ON pickups
  FOR EACH ROW
  EXECUTE FUNCTION restore_pickup_prepaid_credit();
