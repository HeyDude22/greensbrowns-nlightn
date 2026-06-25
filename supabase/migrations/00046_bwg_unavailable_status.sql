-- BWG no-show: collector arrived but BWG unavailable (treated like cancelled, no credit restore).
ALTER TYPE public.pickup_status ADD VALUE IF NOT EXISTS 'bwg_unavailable';
