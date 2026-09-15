ALTER TABLE public.organization ADD COLUMN IF NOT EXISTS retention_days INTEGER NOT NULL DEFAULT -1;
COMMENT ON COLUMN public.organization.retention_days IS 'Disabled if -1.  Otherwise number of days to keep media before deleting.  Phase 1 is external script then this will be handled by eventing.';
