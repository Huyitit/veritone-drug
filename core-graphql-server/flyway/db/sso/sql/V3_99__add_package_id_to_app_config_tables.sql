ALTER TABLE public.app_config_definition ADD COLUMN IF NOT EXISTS package_id UUID DEFAULT NULL;
