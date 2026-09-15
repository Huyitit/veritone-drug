-- VP-2581 follow-up: drop the "(Ayrshare)" vendor suffix from the social destination_type display names.
--
-- The DMH UI surfaces destination_type.name directly and the vendor is an implementation detail end users
-- shouldn't see. Stage was already hand-renamed to 'YouTube'; this codifies that rename and applies it
-- consistently to all four platforms. Ids are the pre-generated seed ids from V3_292 / V3_295.
-- Data-only upsert — no DDL.
--
-- Self-converging upsert: mirrors the V3_292/V3_295 seed rows (same columns/values, with the plain platform
-- names) so this migration produces the correct final state whether the rows are absent, drifted, or already
-- right. The DO UPDATE reconciles EVERY seed-owned column, not just `name` — a name-only guard would
-- short-circuit the whole row on stage, whose YouTube row was already hand-renamed to 'YouTube', leaving any
-- other column that hand-edit touched divergent from source control permanently.
--
-- The guard is a whole-tuple IS DISTINCT FROM, so fully-converged rows are skipped and updated_at stays
-- meaningful, while anything drifted gets pulled back. It is the GUARD, not the SET, that preserves
-- updated_at: trigger_update_destination_type_updated_at (V3_289) already forces updated_at = NOW() on every
-- UPDATE, so an explicit assignment would be redundant and is deliberately omitted.
--
-- deleted_at is deliberately NOT converged. There is no application write path to this table (the DAL exports
-- only getters; V3_289 documents it as Flyway-provisioned, not user-CRUD), so the only producer of a
-- soft-deleted row is a human in psql — and that is the one disable mechanism these rows have, since
-- getDestinationTypes filters on `dt.deleted_at IS NULL` and is_public is not enforced anywhere. Reviving it
-- here would silently undo an operator who pulled a platform during a vendor incident, and could leave two
-- live rows for one platform (a duplicate catalog tile). An invisible catalog entry is the safer failure.
--
-- Ordering note: this runs in the `platform` database, which the migration runner processes BEFORE
-- `structured_data`, in separate transactions. The publish_schema_id values below point at data_registries
-- rows that structured_data V1_13/V1_15 own, so a structured_data failure can leave these catalog rows live
-- while their publish schema is not yet converged. Flyway cannot span the two; noted so it is not a surprise.
INSERT INTO public.destination_type
  (id, name, platform, vendor_capability, icon_class, engine_id, config_schema_id, publish_schema_id, is_public)
VALUES
  ('c42be8c9-a848-4bc7-b461-5001dc342232'::uuid,
   'YouTube',
   'youtube',
   'social-publish',
   'icon-youtube',
   '16568b5f-2aaa-48e6-975b-2dec5f098a29',          -- engine_id = the engine's registered UUID (job_new.engine.engine_id; routes the distribute Job)
   'd78e9ed7-597e-41ae-b5e9-665b18c71f15'::uuid,   -- configSchema (data_registries)
   '34fb89b9-cf59-4ca2-bc9c-bf19f8af5216'::uuid,   -- publishSchema (data_registries)
   true),
  ('dcadf81c-9127-4db8-978d-2cf3b0109187'::uuid, 'Facebook',  'facebook',  'social-publish', 'icon-facebook',
   '16568b5f-2aaa-48e6-975b-2dec5f098a29', 'bc6be380-c667-40c1-a554-514a84c3f5bd'::uuid, '207b39ef-acc8-4cb0-ab91-bd447853c5aa'::uuid, true),
  ('b0cc0c8e-409b-44d5-9d0f-389144aa53e0'::uuid, 'Instagram', 'instagram', 'social-publish', 'icon-instagram',
   '16568b5f-2aaa-48e6-975b-2dec5f098a29', '2ce68a43-cde7-4dec-8ef1-1df0282e213f'::uuid, 'd9766799-427d-4930-afac-f3dc9b744909'::uuid, true),
  ('255f1b92-1ce6-494d-b601-1fa6cae36cec'::uuid, 'TikTok',    'tiktok',    'social-publish', 'icon-tiktok',
   '16568b5f-2aaa-48e6-975b-2dec5f098a29', 'fb1ac425-d872-4aee-9270-7c759c7a4bf1'::uuid, 'a1fa8bce-40b8-4020-b851-02b22ef8d4f9'::uuid, true)
ON CONFLICT (id) DO UPDATE SET
  name              = EXCLUDED.name,
  platform          = EXCLUDED.platform,
  vendor_capability = EXCLUDED.vendor_capability,
  icon_class        = EXCLUDED.icon_class,
  engine_id         = EXCLUDED.engine_id,
  config_schema_id  = EXCLUDED.config_schema_id,
  publish_schema_id = EXCLUDED.publish_schema_id,
  is_public         = EXCLUDED.is_public
WHERE (destination_type.name, destination_type.platform, destination_type.vendor_capability,
       destination_type.icon_class, destination_type.engine_id,
       destination_type.config_schema_id, destination_type.publish_schema_id,
       destination_type.is_public)
   IS DISTINCT FROM
      (EXCLUDED.name, EXCLUDED.platform, EXCLUDED.vendor_capability,
       EXCLUDED.icon_class, EXCLUDED.engine_id,
       EXCLUDED.config_schema_id, EXCLUDED.publish_schema_id, EXCLUDED.is_public);
