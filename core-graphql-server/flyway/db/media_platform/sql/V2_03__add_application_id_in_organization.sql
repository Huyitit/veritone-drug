ALTER TABLE public.organization ADD COLUMN IF NOT EXISTS organization_guid uuid;
CREATE UNIQUE INDEX IF NOT EXISTS _ix_unique_organization_guid ON public.organization (organization_guid) WHERE organization_guid IS NOT NULL;
