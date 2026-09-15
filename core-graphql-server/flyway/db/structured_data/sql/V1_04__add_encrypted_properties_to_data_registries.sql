ALTER TABLE IF EXISTS
  public.data_registries
ADD
  COLUMN IF NOT EXISTS "encrypted_properties" TEXT [] NULL;

COMMENT ON COLUMN public.data_registries.encrypted_properties IS 'The names of the properties in the schema that need to be encrypted before being stored in an SDO';

ALTER TABLE IF EXISTS
  public.data_registries
ADD
  COLUMN IF NOT EXISTS "query_excluded_properties" TEXT [] NULL;

COMMENT ON COLUMN public.data_registries.query_excluded_properties IS 'The names of the properties in the schema that should be excluded from query results';