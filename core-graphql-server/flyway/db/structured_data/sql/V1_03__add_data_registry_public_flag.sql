ALTER TABLE public.data_registry_metadata ADD COLUMN IF NOT EXISTS "is_public" bool NULL;
UPDATE public.data_registry_metadata SET is_public = TRUE WHERE is_public IS NULL AND deleted_at IS NULL;