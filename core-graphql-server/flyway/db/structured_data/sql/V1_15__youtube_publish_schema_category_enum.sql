-- VP-2581 follow-up: give the YouTube publishSchema's categoryId a closed option list with display labels.
--
-- Codifies the schema shape the DMH team hand-applied on stage so prod picks it up through Flyway and the DB
-- matches source control again. Everything except categoryId is unchanged from the V1_13 seed (description keeps
-- maxLength 5000; required stays ["title"]; visibility keeps its plain enum). categoryId changes from a free
-- numeric string (pattern ^[0-9]+$) to the 15 assignable YouTube category ids, expressed as a `oneOf` of
-- `const`/`title` branches that the dmh-hive publish form renders as a labeled dropdown (see dmh-hive
-- src/app/data/distribution/mocks.ts).
--
-- The list is exactly the ids YouTube reports with snippet.assignable = true for regionCode=US
-- (videoCategories.list): 1, 2, 10, 15, 17, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29. Everything else in the
-- API response is non-assignable and is rejected at upload: 18 (Short Movies) and 21 (Videoblogging) are
-- legacy values, and 30-44 (Movies, Shorts, Shows, Trailers, and the 31-41 genre ids) are reserved for
-- YouTube's own catalog. Ayrshare documents the same flag on GET /api/post/youtubeCategories/{country}
-- and states that non-assignable ids "will result in an error", so filtering here converts what would be a
-- late vendor error from the distribute engine into up-front schema validation.
--
-- `oneOf` rather than `enumNames`: enumNames is deprecated in @rjsf 5.x and removed in 6.x, whereas
-- oneOf/const/title is the supported form in both. @rjsf/utils optionsList() normalizes either shape into
-- the same enumOptions the dmh-hive widgets consume, so this is presentation-neutral today. Neither `title`
-- nor the branch titles affect AJV: the validator runs with strict:false (modules/v3DataModel/validation/
-- schemaValidator.js), and oneOf-of-const validates identically to the equivalent enum.
--
-- NOTE: this makes server-side validation of DistributeAssetInput.platformPayload stricter — categoryId
-- values outside the list (e.g. "30") now fail validation. Stage already behaves this way, except that
-- stage's hand-applied copy carried the same 30-for-19 error this migration corrects.

-- 1) data_registry_metadata — re-assert the PARENT row so the child upsert below can't fail the run.
-- data_registries.data_registry_metadata_id is NOT NULL under FK data_registries_data_registry_metadata_id_fk
-- (V1_01), and V1_13 seeded parent and child together in one migration. So on any environment genuinely
-- missing the child row, the parent is almost certainly missing too, and inserting the child alone would raise
-- a FK violation and abort the whole structured_data run — strictly worse than the silent no-op this replaces.
-- Values mirror V1_13 exactly, fixed timestamps included, so a fresh insert is indistinguishable from the seed.
--
-- The DO UPDATE clears deleted_at and NOTHING else. It has to be here because no migration in the chain
-- revives this row: V1_13's parent upsert sets name/description/source/org_id/is_system/is_public but not
-- deleted_at, and the app soft-deletes the parent too whenever the deleted schema was the last one in its
-- registry (structureddata.js deleteSchema). A stale parent deleted_at makes the engine-grant access path
-- (is_public AND deleted_at IS NULL) drop the schema for normal-token callers.
-- Deliberately NOT re-asserting is_system/is_public: is_system widens SDO reads across orgs (structureddata.js
-- drops the organization_id filter for system registries), so a migration must not silently restore a
-- privileged flag an operator unset — cf. V1_11__s3_discovery_unset_is_system. Those columns stay V1_13's.
INSERT INTO public.data_registry_metadata
  (id, "name", description, "source", org_id, created_by, modified_by, created_at, updated_at, is_system, is_public)
VALUES
  ('8f4c0d2b-6e35-4f99-b021-0b3d7e5f2012'::uuid,
   'Distribute:Ayrshare:YouTube publishSchema',
   'VP-2581: publish-payload schema for distributing an asset to YouTube via Ayrshare.',
   'Internal', @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-06-25 00:00:00', '2026-06-25 00:00:00', true, true)
ON CONFLICT (id) DO UPDATE SET
  deleted_at = NULL
WHERE data_registry_metadata.deleted_at IS NOT NULL;

-- 2) data_registries — the schema row itself.
-- Data-only upsert of the pre-generated V1_13 row; minor_version bumped 0 -> 1 to mark the revision.
-- Self-converging upsert: mirrors the V1_13 seed row (same columns/values) so this
-- migration also produces the correct final state on environments where the row is
-- absent, instead of silently no-opping. On existing rows it touches schema content,
-- minor_version, status, deletedAt, updatedAt.
INSERT INTO public.data_registries
  (id, "schema", org_id, created_by, modified_by, "createdAt", "updatedAt", data_registry_metadata_id, major_version, minor_version, "status", storage_name)
VALUES
  ('34fb89b9-cf59-4ca2-bc9c-bf19f8af5216'::uuid,
   '{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["title"],
    "additionalProperties": false,
    "properties": {
      "title": {"type": "string", "maxLength": 100},
      "description": {"type": "string", "maxLength": 5000},
      "visibility": {"type": "string", "enum": ["public", "unlisted", "private"], "default": "private"},
      "categoryId": {
        "type": "string",
        "title": "Category",
        "oneOf": [
          {"const": "1",  "title": "Film & Animation"},
          {"const": "2",  "title": "Autos & Vehicles"},
          {"const": "10", "title": "Music"},
          {"const": "15", "title": "Pets & Animals"},
          {"const": "17", "title": "Sports"},
          {"const": "19", "title": "Travel & Events"},
          {"const": "20", "title": "Gaming"},
          {"const": "22", "title": "People & Blogs"},
          {"const": "23", "title": "Comedy"},
          {"const": "24", "title": "Entertainment"},
          {"const": "25", "title": "News & Politics"},
          {"const": "26", "title": "Howto & Style"},
          {"const": "27", "title": "Education"},
          {"const": "28", "title": "Science & Technology"},
          {"const": "29", "title": "Nonprofits & Activism"}
        ]
      },
      "madeForKids": {"type": "boolean", "default": false}
    }
  }'::jsonb,
   @@{ROOT_ORG_ID}@@, NULL, NULL, '2026-06-25 00:00:00', '2026-06-25 00:00:00',
   '8f4c0d2b-6e35-4f99-b021-0b3d7e5f2012'::uuid, 1, 1, 'published'::public.enum_data_registries_status, NULL)
-- "deletedAt" AND "status" both revive a row removed through the app's soft-delete path rather than dropped.
-- deleteSchema (dal/structureddata.js) writes "deletedAt" and status='deleted' in ONE update, so clearing only
-- "deletedAt" leaves the row stuck at 'deleted' — permanently, because schemaStateTransitions maps
-- deleted -> [] and no API call can publish it again, and because status='published' is required by
-- checkCompatibility, _getInheritedStorageName and the public-schema EXISTS check. Converging status is not
-- new here: V1_13's own DO UPDATE already sets it, and V1_15 simply has to keep doing so.
-- The two extra guard terms are what make the revival reachable at all — a soft-deleted row that already
-- carries the right schema would otherwise short-circuit on the schema/minor_version tests.
ON CONFLICT (id) DO UPDATE SET
  "schema"      = EXCLUDED."schema",
  minor_version = EXCLUDED.minor_version,
  "status"      = EXCLUDED."status",
  "deletedAt"   = NULL,
  "updatedAt"   = NOW()
WHERE data_registries."schema" IS DISTINCT FROM EXCLUDED."schema"
   OR data_registries.minor_version IS DISTINCT FROM EXCLUDED.minor_version
   OR data_registries."status" IS DISTINCT FROM EXCLUDED."status"
   OR data_registries."deletedAt" IS NOT NULL;
