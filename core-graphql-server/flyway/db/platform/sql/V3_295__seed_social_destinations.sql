-- VE-24932/24933/24934: seed the Facebook, Instagram, TikTok destination_type rows.
--
-- Additive data migration only — NO DDL (the engine_id unique index is dropped separately in V3_294). Appends to the
-- VP-2581 foundation (tables + Ayrshare engine + YouTube seed) on master at V3_289–V3_292. All three reuse the shared
-- generic Ayrshare distribute engine UUID (Q-AD4 — no new engine row); the engine routes by platform key (VE-24797).
-- Pre-generated hardcoded ids (identical across dev/stage/prod); config/publish schema ids -> structured_data V1_14.
-- icon_class values resolve via the FE PLATFORM_ICONS map (platformIcon.tsx; prefix stripped). Idempotent.
INSERT INTO public.destination_type
  (id, name, platform, vendor_capability, icon_class, engine_id, config_schema_id, publish_schema_id, is_public)
VALUES
  ('dcadf81c-9127-4db8-978d-2cf3b0109187'::uuid, 'Facebook (Ayrshare)',  'facebook',  'social-publish', 'icon-facebook',
   '16568b5f-2aaa-48e6-975b-2dec5f098a29', 'bc6be380-c667-40c1-a554-514a84c3f5bd'::uuid, '207b39ef-acc8-4cb0-ab91-bd447853c5aa'::uuid, true),
  ('b0cc0c8e-409b-44d5-9d0f-389144aa53e0'::uuid, 'Instagram (Ayrshare)', 'instagram', 'social-publish', 'icon-instagram',
   '16568b5f-2aaa-48e6-975b-2dec5f098a29', '2ce68a43-cde7-4dec-8ef1-1df0282e213f'::uuid, 'd9766799-427d-4930-afac-f3dc9b744909'::uuid, true),
  ('255f1b92-1ce6-494d-b601-1fa6cae36cec'::uuid, 'TikTok (Ayrshare)',    'tiktok',    'social-publish', 'icon-tiktok',
   '16568b5f-2aaa-48e6-975b-2dec5f098a29', 'fb1ac425-d872-4aee-9270-7c759c7a4bf1'::uuid, 'a1fa8bce-40b8-4020-b851-02b22ef8d4f9'::uuid, true)
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
