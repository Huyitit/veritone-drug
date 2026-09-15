ALTER TABLE public.organization ADD COLUMN IF NOT EXISTS is_hub_managed BOOLEAN DEFAULT false;
-- create partial index
CREATE INDEX IF NOT EXISTS idx_organization_is_hub_managed ON public.organization(is_hub_managed) WHERE is_hub_managed;
