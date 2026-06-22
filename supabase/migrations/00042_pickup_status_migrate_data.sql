-- Map legacy pickup statuses to the new lifecycle vocabulary.
UPDATE public.pickups SET status = 'requested' WHERE status = 'scheduled';
UPDATE public.pickups SET status = 'accepted' WHERE status = 'received';
UPDATE public.pickups SET status = 'arrived_processor' WHERE status = 'delivered';
UPDATE public.pickups SET status = 'full_pickup' WHERE status = 'picked_up';

UPDATE public.pickup_events SET status = 'requested' WHERE status = 'scheduled';
UPDATE public.pickup_events SET status = 'accepted' WHERE status = 'received';
UPDATE public.pickup_events SET status = 'arrived_processor' WHERE status = 'delivered';
UPDATE public.pickup_events SET status = 'full_pickup' WHERE status = 'picked_up';
