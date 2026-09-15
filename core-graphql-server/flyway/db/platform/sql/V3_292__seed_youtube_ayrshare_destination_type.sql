-- VP-2581: seed the "YouTube (Ayrshare)" destination_type row.
-- Logical refs (no FK): engine_id -> job_new.engine.engine_id (seeded in V3_291);
-- config_schema_id / publish_schema_id -> public.data_registries.id (seeded in structured_data V1_13).
-- Pre-generated hardcoded id so it's identical across dev/stage/prod.
INSERT INTO public.destination_type
  (id, name, platform, vendor_capability, icon_class, engine_id, config_schema_id, publish_schema_id, is_public)
VALUES
  ('c42be8c9-a848-4bc7-b461-5001dc342232'::uuid,
   'YouTube (Ayrshare)',
   'youtube',
   'social-publish',
   'icon-youtube',
   '16568b5f-2aaa-48e6-975b-2dec5f098a29',          -- engine_id = the engine's registered UUID (job_new.engine.engine_id; routes the distribute Job)
   'd78e9ed7-597e-41ae-b5e9-665b18c71f15'::uuid,   -- configSchema (data_registries)
   '34fb89b9-cf59-4ca2-bc9c-bf19f8af5216'::uuid,   -- publishSchema (data_registries)
   true)
ON CONFLICT (id) DO UPDATE SET
  name              = EXCLUDED.name,
  platform          = EXCLUDED.platform,
  vendor_capability = EXCLUDED.vendor_capability,
  icon_class        = EXCLUDED.icon_class,
  engine_id         = EXCLUDED.engine_id,
  config_schema_id  = EXCLUDED.config_schema_id,
  publish_schema_id = EXCLUDED.publish_schema_id,
  is_public         = EXCLUDED.is_public,
  updated_at        = NOW();
