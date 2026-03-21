-- Add processor_type to farmer_details
CREATE TYPE processor_type AS ENUM ('farmer', 'biochar', 'compost_manufacturer', 'mulch_producer', 'other');
ALTER TABLE public.farmer_details ADD COLUMN processor_type processor_type DEFAULT 'farmer';
