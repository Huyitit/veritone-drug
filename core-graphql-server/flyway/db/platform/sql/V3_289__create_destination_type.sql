-- VP-2581: Distribution Center — destination_type catalog table.
-- One row per seeded destination platform (e.g. "YouTube (Ayrshare)"). Seeded via Flyway, not user-CRUD.
-- No foreign keys (perf policy, aiware-core/CLAUDE.md): config_schema_id / publish_schema_id are LOGICAL refs
-- to public.data_registries.id (structured_data DB); engine_id is a LOGICAL ref to job_new.engine.engine_id.
CREATE TABLE IF NOT EXISTS public.destination_type (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  platform           TEXT NOT NULL,
  vendor_capability  TEXT NOT NULL,
  icon_class         TEXT,
  engine_id          TEXT NOT NULL,
  config_schema_id   UUID NOT NULL,
  publish_schema_id  UUID NOT NULL,
  is_public          BOOLEAN NOT NULL DEFAULT false,
  created_by         TEXT,
  created_at         TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_by         TEXT,
  updated_at         TIMESTAMP DEFAULT NOW() NOT NULL,
  deleted_at         TIMESTAMP
);

-- One live destination_type per engine; platform lookups for the catalog query.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_destination_type__engine_id_unique"
  ON public.destination_type(engine_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_destination_type__platform"
  ON public.destination_type(platform) WHERE deleted_at IS NULL;

-- Auto-update updated_at on row update (house convention).
CREATE OR REPLACE FUNCTION public.update_destination_type_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_destination_type_updated_at ON public.destination_type;
CREATE TRIGGER trigger_update_destination_type_updated_at
  BEFORE UPDATE ON public.destination_type
  FOR EACH ROW
  EXECUTE FUNCTION public.update_destination_type_updated_at();

COMMENT ON TABLE  public.destination_type                   IS 'VP-2581: catalog of seeded destination platforms (e.g. YouTube via Ayrshare). One row per platform; references the distribute engine + the config/publish JSON-Schemas. Seeded via Flyway, not user-CRUD.';
COMMENT ON COLUMN public.destination_type.name              IS 'Display name, e.g. "YouTube (Ayrshare)".';
COMMENT ON COLUMN public.destination_type.platform          IS 'Platform key, e.g. "youtube". Future: "instagram", "s3", …';
COMMENT ON COLUMN public.destination_type.vendor_capability IS 'Capability tag, e.g. "social-publish".';
COMMENT ON COLUMN public.destination_type.icon_class        IS 'FE icon class for the catalog tile.';
COMMENT ON COLUMN public.destination_type.engine_id         IS 'LOGICAL ref to job_new.engine.engine_id (no FK). The distribute engine used for this platform.';
COMMENT ON COLUMN public.destination_type.config_schema_id  IS 'LOGICAL ref to public.data_registries.id (no FK). JSON-Schema that Destination.details must conform to.';
COMMENT ON COLUMN public.destination_type.publish_schema_id IS 'LOGICAL ref to public.data_registries.id (no FK). JSON-Schema that DistributeAssetInput.platformPayload must conform to.';
COMMENT ON COLUMN public.destination_type.is_public         IS 'Whether the type is visible to all orgs in the catalog.';
COMMENT ON COLUMN public.destination_type.deleted_at        IS 'Soft-delete timestamp; NULL = active.';
