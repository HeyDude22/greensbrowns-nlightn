CREATE TABLE public.pickup_ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pickup_id UUID NOT NULL REFERENCES public.pickups(id),
  rated_by UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('bwg', 'collector')),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pickup_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all ratings" ON public.pickup_ratings FOR SELECT USING (true);
CREATE POLICY "Users can insert own ratings" ON public.pickup_ratings FOR INSERT WITH CHECK (auth.uid() = rated_by);
