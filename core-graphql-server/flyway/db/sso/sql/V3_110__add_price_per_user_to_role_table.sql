-- Adding new price column to role table
ALTER TABLE public.role ADD COLUMN IF NOT EXISTS price_per_user FLOAT;
-- Comment on column
COMMENT ON COLUMN public.role.price_per_user is 'Price in USD per user with this role';