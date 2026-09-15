ALTER TABLE public.app_config DROP CONSTRAINT IF EXISTS app_config_user_id_fkey;
COMMENT ON COLUMN public.app_config.user_id IS 'User ID UUID for user level config or Org GUID for org level config';
