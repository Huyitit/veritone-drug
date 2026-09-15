DO $FLYWAY$
BEGIN

  -- 
  ALTER TABLE public.organization_invite__invite_action_audit
  DROP CONSTRAINT IF EXISTS org_invite_audit_id;

  ALTER TABLE public.organization_invite__invite_action_audit
  ADD COLUMN IF NOT EXISTS kvp JSONB null;

END;
$FLYWAY$