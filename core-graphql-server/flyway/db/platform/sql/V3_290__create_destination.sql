-- VP-2581: Distribution Center — destination table.
-- Org-scoped connected destinations. One row = one social-network channel binding (1:1 to an Ayrshare User
-- Profile); multiple per org, labeled, soft-deleted. See aidlc-docs/VP-2581 multitenancy.md.
-- No foreign keys (perf policy, aiware-core/CLAUDE.md): destination_type_id is a LOGICAL ref to
-- public.destination_type.id; created_by_user_id is a LOGICAL ref to the creating user.
CREATE TABLE IF NOT EXISTS public.destination (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        INTEGER NOT NULL,
  destination_type_id    UUID NOT NULL,
  label                  TEXT NOT NULL,
  details                JSONB,
  vendor_profile_id      TEXT NOT NULL,
  platform_account_label TEXT,
  status                 TEXT NOT NULL DEFAULT 'PENDING_OAUTH',
  oauth_url              TEXT,
  oauth_url_expires_at   TIMESTAMP,
  created_by_user_id     UUID NOT NULL,
  created_at             TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_by             TEXT,
  updated_at             TIMESTAMP DEFAULT NOW() NOT NULL,
  deleted_at             TIMESTAMP
);

-- Org-scoped listing; one live destination per (type, Ayrshare profile).
CREATE INDEX IF NOT EXISTS "idx_destination__organization_id"
  ON public.destination(organization_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_destination__type_vendor_profile_unique"
  ON public.destination(destination_type_id, vendor_profile_id) WHERE deleted_at IS NULL;

-- Auto-update updated_at on row update (house convention).
CREATE OR REPLACE FUNCTION public.update_destination_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_destination_updated_at ON public.destination;
CREATE TRIGGER trigger_update_destination_updated_at
  BEFORE UPDATE ON public.destination
  FOR EACH ROW
  EXECUTE FUNCTION public.update_destination_updated_at();

COMMENT ON TABLE  public.destination                        IS 'VP-2581: org-scoped connected destinations. One row = one social-network channel binding (1:1 to an Ayrshare User Profile). Multiple per org, labeled, soft-deleted. See multitenancy.md.';
COMMENT ON COLUMN public.destination.organization_id        IS 'Owning Veritone org (row-level scope; enforced in the DAL via parameterized WHERE).';
COMMENT ON COLUMN public.destination.destination_type_id    IS 'LOGICAL ref to public.destination_type.id (no FK).';
COMMENT ON COLUMN public.destination.label                  IS 'Admin-supplied label, e.g. "Marketing YouTube".';
COMMENT ON COLUMN public.destination.details                IS 'JSONB validated against destination_type.config_schema at every write.';
COMMENT ON COLUMN public.destination.vendor_profile_id      IS 'Ayrshare Profile-Key (bearer capability). Gated by @scopes(aiware.organization.read) on the GraphQL field; not surfaced to FE in MVP.';
COMMENT ON COLUMN public.destination.platform_account_label IS 'Connected account label, e.g. "@channel-name" (set by verifyConnection).';
COMMENT ON COLUMN public.destination.status                 IS 'PENDING_OAUTH | CONNECTED | DISCONNECTED | ERROR.';
COMMENT ON COLUMN public.destination.oauth_url              IS 'Short-lived Ayrshare-hosted Connect URL; set when status=PENDING_OAUTH, cleared on CONNECTED.';
COMMENT ON COLUMN public.destination.oauth_url_expires_at   IS 'Expiry of oauth_url.';
COMMENT ON COLUMN public.destination.created_by_user_id     IS 'LOGICAL ref to the creating user (no FK).';
COMMENT ON COLUMN public.destination.deleted_at             IS 'Soft-delete timestamp; NULL = active.';
