-- Persist phone from signup metadata into profiles (email+password signups have no auth.users.phone).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.phone, NULLIF(NEW.raw_user_meta_data->>'phone', '')),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'bwg'
  );
  RETURN NEW;
END;
$$;
