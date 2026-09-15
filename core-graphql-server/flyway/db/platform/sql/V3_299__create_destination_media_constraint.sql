-- VE-26450: per-destination media constraints, declared as data, for pre-flight validation at distributeAsset.
--
-- Keyed by (destination_type_id, post_type) because limits differ WITHIN a platform — Instagram Reels allow
-- 3s-15min where Stories video allows 3-60s — so other post types are future rows rather than a migration.
-- post_type is DESCRIPTIVE: nothing selects one at publish time, so the mutation reads by destination_type_id
-- alone. Names are per platform; 'reels' is Instagram's.
--
-- The limits live in constraint_schema as a JSON Schema, evaluated against the asset's measured properties by
-- the same ajv validator that checks DistributeAssetInput.platformPayload. A new limit is therefore a change to
-- this row, not a migration, an API field and a code change. The API serves the document to clients verbatim so
-- the browser can run the identical check before a publish is submitted.
--
-- post_type is TEXT with a lowercase CHECK rather than an enum: the vocabulary is the vendor's and grows when a
-- platform ships a new surface, so values should be rows rather than ALTER TYPE. An enum also could not express
-- the constraint that matters, which is a (platform, post_type) pairing — ('youtube','reels') is nonsense but
-- would satisfy any global enum. That pairing is asserted in CI.
--
-- No foreign keys (perf policy): destination_type_id is a LOGICAL ref to public.destination_type.id.

CREATE TABLE IF NOT EXISTS public.destination_media_constraint (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_type_id           UUID NOT NULL,
  post_type                     TEXT NOT NULL
    CONSTRAINT destination_media_constraint_post_type_lowercase
    CHECK (post_type = lower(post_type) AND post_type <> ''),

  -- Rejection thresholds, as a JSON Schema over the asset's measured properties. '{}' declares nothing and
  -- enforces nothing, which is the correct row for a platform publishing no documented limits.
  constraint_schema             JSONB NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT destination_media_constraint_schema_is_object
    CHECK (jsonb_typeof(constraint_schema) = 'object'),

  -- Advisory quality targets, keyed by the same property names constraint_schema uses so a client can line
  -- "recommended 1080 wide" up against "must be 320-1920 wide". A flat object of values, NOT a JSON Schema:
  -- a target expressed as a rule ({"widthPx":{"const":1080}}) would be indistinguishable from the column
  -- beside it and reject everything off-target the first time someone handed the wrong one to the validator.
  -- Nothing may ever evaluate this column.
  recommended_media             JSONB NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT destination_media_constraint_recommended_is_object
    CHECK (jsonb_typeof(recommended_media) = 'object'),

  created_by                    TEXT,
  created_at                    TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_by                    TEXT,
  updated_at                    TIMESTAMP DEFAULT NOW() NOT NULL,
  deleted_at                    TIMESTAMP
);

-- One live constraint row per (type, post type); lookup is always by destination_type_id at mutation time.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_destination_media_constraint__type_post_type_unique"
  ON public.destination_media_constraint(destination_type_id, post_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_destination_media_constraint__destination_type_id"
  ON public.destination_media_constraint(destination_type_id) WHERE deleted_at IS NULL;

-- Auto-update updated_at on row update (house convention).
CREATE OR REPLACE FUNCTION public.update_destination_media_constraint_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_destination_media_constraint_updated_at ON public.destination_media_constraint;
CREATE TRIGGER trigger_update_destination_media_constraint_updated_at
  BEFORE UPDATE ON public.destination_media_constraint
  FOR EACH ROW
  EXECUTE FUNCTION public.update_destination_media_constraint_updated_at();

COMMENT ON TABLE  public.destination_media_constraint                          IS 'VE-26450: per-destination media constraints used for pre-flight validation at the distributeAsset mutation. Values come from Ayrshare''s published media guidelines. Keyed by (destination_type_id, post_type) because limits differ within a platform. Seeded via Flyway, not user-CRUD.';
COMMENT ON COLUMN public.destination_media_constraint.destination_type_id      IS 'LOGICAL ref to public.destination_type.id (no FK).';
COMMENT ON COLUMN public.destination_media_constraint.post_type                IS 'Vendor post type the limits DESCRIBE, e.g. "reels" for Instagram, "video" elsewhere. Lowercase. Descriptive, not a lookup key: nothing selects a post type at publish time, so the mutation looks constraints up by destination_type_id alone. Post-type values are per platform — "reels" is Instagram-specific and must not be applied to TikTok or YouTube.';
COMMENT ON COLUMN public.destination_media_constraint.constraint_schema        IS 'VE-26450: JSON Schema (draft-07) evaluated against the asset''s measured properties. Recognised properties are durationMs (MILLISECONDS, same unit as Asset.fileData.mediaDurationMs so no conversion sits between the declared bound and the measured value), widthPx, heightPx and aspectRatio (width/height). A property is enforced only once the server can measure it: durationMs today, the rest behind VE-26886 (rendition selection), because the published asset is a downscaled preview whose master would pass. Declaring a property the server cannot yet measure is therefore inert, not a rejection. "required" must NOT appear: an unmeasurable property has to be skipped, not rejected. Enforced vocabulary is asserted in CI (mediaConstraintSeed.convention.spec.js).';
COMMENT ON COLUMN public.destination_media_constraint.recommended_media         IS 'VE-26450: ADVISORY quality targets as a flat JSON object, e.g. {"widthPx":1080,"heightPx":1920,"aspectRatio":0.5625}. Keys are the property names constraint_schema uses. NEVER rejection thresholds — the platform accepts media that misses them, so nothing evaluates this column. It is deliberately NOT a JSON Schema: encoding a target as a rule would make it interchangeable with constraint_schema, and passing the wrong one to the validator would reject every asset that is not exactly on-target. New advisory keys need no migration; the key vocabulary is asserted in CI.';
COMMENT ON COLUMN public.destination_media_constraint.deleted_at               IS 'Soft-delete timestamp; NULL = active. Soft-deleting a row disables enforcement for that (type, post type) without a code deploy.';
