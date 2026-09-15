-- Adding Organization storage pricing
ALTER TABLE public.organization ADD COLUMN IF NOT EXISTS price_per_stored_gb FLOAT;
-- Comment on column
COMMENT ON COLUMN public.organization.price_per_stored_gb is 'Price in USD per Gigabyte per month for this organization';

-- Adding Organization user pricing
ALTER TABLE public.organization ADD COLUMN IF NOT EXISTS price_per_user FLOAT;
-- Comment on column
COMMENT ON COLUMN public.organization.price_per_user is 'Price in USD per seat in this organization';