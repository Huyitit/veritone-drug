-- VP-2581: seed the config + publish JSON-Schemas for the YouTube (Ayrshare) DestinationType.
-- These are Schema (data_registries) rows used for server-side VALIDATION only (Destination.details against
-- configSchema; DistributeAssetInput.platformPayload against publishSchema). They do NOT back SDO instances, so
-- storage_name is NULL and no sdo_ storage table is created (unlike source-type schemas). Modeled on V1_10.
-- All UUIDs are PRE-GENERATED + hardcoded so the rows have the same ids across dev/stage/prod.
-- org_id uses the @@{ROOT_ORG_ID}@@ Flyway placeholder (supported in structured_data — see V1_10).

-- 1) data_registry_metadata (one per schema)
INSERT INTO public.data_registry_metadata
  (id, "name", description, "source", org_id, created_by, modified_by, created_at, updated_at, is_system, is_public)
VALUES
  ('7e3b9c1a-5d24-4e88-bf10-9a2c6d4e1f01'::uuid,
   'Distribute:Ayrshare:YouTube configSchema',
   'VP-2581: configuration schema for the YouTube (Ayrshare) destination type (label-only at MVP).',
   'Internal', @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-06-25 00:00:00', '2026-06-25 00:00:00', true, true),
  ('8f4c0d2b-6e35-4f99-b021-0b3d7e5f2012'::uuid,
   'Distribute:Ayrshare:YouTube publishSchema',
   'VP-2581: publish-payload schema for distributing an asset to YouTube via Ayrshare.',
   'Internal', @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-06-25 00:00:00', '2026-06-25 00:00:00', true, true)
ON CONFLICT (id) DO UPDATE SET
  "name"      = EXCLUDED."name",
  description = EXCLUDED.description,
  "source"    = EXCLUDED."source",
  org_id      = EXCLUDED.org_id,
  is_system   = EXCLUDED.is_system,
  is_public   = EXCLUDED.is_public;

-- 2) data_registries (the actual Schema rows; GraphQL Schema.definition <- schema)
INSERT INTO public.data_registries
  (id, "schema", org_id, created_by, modified_by, "createdAt", "updatedAt",
   data_registry_metadata_id, major_version, minor_version, "status", storage_name)
VALUES
  -- configSchema: label-only at MVP (Ayrshare needs no extra input to mint the connect URL; Q-NEW-3=A).
  ('d78e9ed7-597e-41ae-b5e9-665b18c71f15'::uuid,
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","additionalProperties":false}'::jsonb,
   @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-06-25 00:00:00', '2026-06-25 00:00:00',
   '7e3b9c1a-5d24-4e88-bf10-9a2c6d4e1f01'::uuid, 1, 0, 'published'::public.enum_data_registries_status, NULL),
  -- publishSchema: YouTube fields, matching the distribute engine's platformPayload contract (process.go
  -- buildPostRequest) + Ayrshare `youTubeOptions`. title (required, <=100), description (<=5000, -> Ayrshare
  -- top-level `post`), visibility (public|unlisted|private, default private), madeForKids (bool), and
  -- categoryId as a NUMERIC STRING (engine reads `CategoryID string` then strconv.Atoi -> int for Ayrshare; a
  -- JSON number here would fail the engine's json.Unmarshal). categoryId OPTIONAL; set required if R-P3 stands.
  ('34fb89b9-cf59-4ca2-bc9c-bf19f8af5216'::uuid,
   '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","required":["title"],"additionalProperties":false,"properties":{"title":{"type":"string","maxLength":100},"description":{"type":"string","maxLength":5000},"visibility":{"type":"string","enum":["public","unlisted","private"],"default":"private"},"categoryId":{"type":"string","pattern":"^[0-9]+$"},"madeForKids":{"type":"boolean","default":false}}}'::jsonb,
   @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-06-25 00:00:00', '2026-06-25 00:00:00',
   '8f4c0d2b-6e35-4f99-b021-0b3d7e5f2012'::uuid, 1, 0, 'published'::public.enum_data_registries_status, NULL)
ON CONFLICT (id) DO UPDATE SET
  "schema"                  = EXCLUDED."schema",
  org_id                    = EXCLUDED.org_id,
  "updatedAt"               = EXCLUDED."updatedAt",
  data_registry_metadata_id = EXCLUDED.data_registry_metadata_id,
  major_version             = EXCLUDED.major_version,
  minor_version             = EXCLUDED.minor_version,
  "status"                  = EXCLUDED."status";
