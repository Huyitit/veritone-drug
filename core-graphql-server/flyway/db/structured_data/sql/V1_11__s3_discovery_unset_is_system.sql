-- The "Discovery: Amazon S3 Source Type Schema" data registry was seeded with is_system = true
-- in V1_10, but it should not be a system registry — it was set by mistake. Unsetting it allows
-- regular org users to create Media Sources (which requires creating an SDO) against this
-- registry without needing internal/superadmin scope. 
--
-- See: services/api/core-graphql-server/dal/structureddata.js (is_system access control check)

UPDATE public.data_registry_metadata
SET is_system = false
WHERE id = '095b2662-be3a-4379-916f-d4258ca50abf'::uuid
  AND is_system = true;
