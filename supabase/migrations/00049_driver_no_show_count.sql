-- Track driver no-shows. NULL = no offences yet; otherwise the running count.
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS no_show_count INTEGER;
