-- VE-24932/24933/24934: config + publish JSON-Schemas for the Facebook, Instagram, TikTok DestinationTypes.
--
-- Appends to master's V1_13 (YouTube schemas). Schema (data_registries) rows used for server-side VALIDATION only
-- (Destination.details vs configSchema; DistributeAssetInput.platformPayload vs publishSchema); they do NOT back SDO
-- instances (storage_name NULL). All UUIDs pre-generated + hardcoded; org_id = @@{ROOT_ORG_ID}@@ placeholder.
--
-- Payload shape (Option A, per vendor survey VE-24935): post text is the top-level `caption`; platform-specific fields
-- go under an `options` object that the generic distribute-ayrshare engine forwards verbatim into <platform>Options.

-- 1) data_registry_metadata (config + publish, per platform)
INSERT INTO public.data_registry_metadata
  (id, "name", description, "source", org_id, created_by, modified_by, created_at, updated_at, is_system, is_public)
VALUES
  ('74a6eaef-eda3-4161-8e1b-00327496263d'::uuid, 'Distribute:Ayrshare:Facebook configSchema',
   'Configuration schema for the Facebook (Ayrshare) destination type (label-only at MVP).',
   'Internal', @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-07-15 00:00:00', '2026-07-15 00:00:00', true, true),
  ('062607cc-f3a8-4e82-996d-e26caa8a23c7'::uuid, 'Distribute:Ayrshare:Facebook publishSchema',
   'Publish-payload schema for distributing an asset to a Facebook Page via Ayrshare.',
   'Internal', @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-07-15 00:00:00', '2026-07-15 00:00:00', true, true),
  ('a56cb13b-01c3-4020-8563-fc39527752cd'::uuid, 'Distribute:Ayrshare:Instagram configSchema',
   'Configuration schema for the Instagram (Ayrshare) destination type (label-only at MVP).',
   'Internal', @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-07-15 00:00:00', '2026-07-15 00:00:00', true, true),
  ('785ff555-505a-4a2a-afa3-0fff11a12564'::uuid, 'Distribute:Ayrshare:Instagram publishSchema',
   'Publish-payload schema for distributing an asset to Instagram via Ayrshare.',
   'Internal', @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-07-15 00:00:00', '2026-07-15 00:00:00', true, true),
  ('6685eb3a-24d5-43e0-9356-5f1e27738199'::uuid, 'Distribute:Ayrshare:TikTok configSchema',
   'Configuration schema for the TikTok (Ayrshare) destination type (label-only at MVP).',
   'Internal', @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-07-15 00:00:00', '2026-07-15 00:00:00', true, true),
  ('9e17bfc7-8895-44e4-ba55-63ac5b3b7c91'::uuid, 'Distribute:Ayrshare:TikTok publishSchema',
   'Publish-payload schema for distributing a video to TikTok via Ayrshare.',
   'Internal', @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-07-15 00:00:00', '2026-07-15 00:00:00', true, true)
ON CONFLICT (id) DO UPDATE SET
  "name"      = EXCLUDED."name",
  description = EXCLUDED.description,
  "source"    = EXCLUDED."source",
  org_id      = EXCLUDED.org_id,
  is_system   = EXCLUDED.is_system,
  is_public   = EXCLUDED.is_public;

-- 2) data_registries (the Schema rows; GraphQL Schema.definition <- schema)
INSERT INTO public.data_registries
  (id, "schema", org_id, created_by, modified_by, "createdAt", "updatedAt",
   data_registry_metadata_id, major_version, minor_version, "status", storage_name)
VALUES
  -- Facebook: caption -> post; options.link -> faceBookOptions.link. Media optional (FB allows text-only). 63206 = FB limit.
  ('bc6be380-c667-40c1-a554-514a84c3f5bd'::uuid,
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","additionalProperties":false}'::jsonb,
   @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-07-15 00:00:00', '2026-07-15 00:00:00',
   '74a6eaef-eda3-4161-8e1b-00327496263d'::uuid, 1, 0, 'published'::public.enum_data_registries_status, NULL),
  ('207b39ef-acc8-4cb0-ab91-bd447853c5aa'::uuid,
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","additionalProperties":false,"properties":{"caption":{"type":"string","maxLength":63206},"options":{"type":"object","additionalProperties":false,"properties":{"link":{"type":"string","format":"uri"}}}}}'::jsonb,
   @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-07-15 00:00:00', '2026-07-15 00:00:00',
   '062607cc-f3a8-4e82-996d-e26caa8a23c7'::uuid, 1, 0, 'published'::public.enum_data_registries_status, NULL),
  -- Instagram: caption -> post; options.autoResize -> instagramOptions. Media required (from the TDO, engine-enforced). 2200 = IG caption limit.
  ('2ce68a43-cde7-4dec-8ef1-1df0282e213f'::uuid,
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","additionalProperties":false}'::jsonb,
   @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-07-15 00:00:00', '2026-07-15 00:00:00',
   'a56cb13b-01c3-4020-8563-fc39527752cd'::uuid, 1, 0, 'published'::public.enum_data_registries_status, NULL),
  ('d9766799-427d-4930-afac-f3dc9b744909'::uuid,
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","additionalProperties":false,"properties":{"caption":{"type":"string","maxLength":2200},"options":{"type":"object","additionalProperties":false,"properties":{"autoResize":{"type":"boolean","default":true}}}}}'::jsonb,
   @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-07-15 00:00:00', '2026-07-15 00:00:00',
   '785ff555-505a-4a2a-afa3-0fff11a12564'::uuid, 1, 0, 'published'::public.enum_data_registries_status, NULL),
  -- TikTok: caption -> post; options.* -> tikTokOptions; video required. visibility default 'public' — revisit if the
  -- TikTok direct-post audit forces private/self-only (VE-24935).
  ('fb1ac425-d872-4aee-9270-7c759c7a4bf1'::uuid,
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","additionalProperties":false}'::jsonb,
   @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-07-15 00:00:00', '2026-07-15 00:00:00',
   '6685eb3a-24d5-43e0-9356-5f1e27738199'::uuid, 1, 0, 'published'::public.enum_data_registries_status, NULL),
  ('a1fa8bce-40b8-4020-b851-02b22ef8d4f9'::uuid,
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","additionalProperties":false,"properties":{"caption":{"type":"string","maxLength":2200},"options":{"type":"object","additionalProperties":false,"required":["visibility"],"properties":{"visibility":{"type":"string","enum":["public","private","followers","friends"],"default":"public"},"disableComments":{"type":"boolean","default":false},"disableDuet":{"type":"boolean","default":false},"disableStitch":{"type":"boolean","default":false}}}}}'::jsonb,
   @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-07-15 00:00:00', '2026-07-15 00:00:00',
   '9e17bfc7-8895-44e4-ba55-63ac5b3b7c91'::uuid, 1, 0, 'published'::public.enum_data_registries_status, NULL)
ON CONFLICT (id) DO UPDATE SET
  "schema"                  = EXCLUDED."schema",
  org_id                    = EXCLUDED.org_id,
  "updatedAt"               = EXCLUDED."updatedAt",
  data_registry_metadata_id = EXCLUDED.data_registry_metadata_id,
  major_version             = EXCLUDED.major_version,
  minor_version             = EXCLUDED.minor_version,
  "status"                  = EXCLUDED."status";
