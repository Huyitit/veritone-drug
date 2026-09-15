DO $FLYWAY$
BEGIN

  -- Add column created_by to organization_invite table 
  ALTER TABLE public.organization_invite ADD COLUMN IF NOT EXISTS created_by TEXT NULL;

  ALTER TABLE public.organization_invite OWNER TO postgres;
  GRANT SELECT ON TABLE public.organization_invite TO readaccess;

  ALTER TABLE public.organization_invite__application_roles OWNER TO postgres;
  GRANT SELECT ON TABLE public.organization_invite__application_roles TO readaccess;
  
  ALTER TABLE public.organization_invite__invite_action_audit OWNER TO postgres;
  GRANT SELECT ON TABLE public.organization_invite__invite_action_audit TO readaccess;

END;
$FLYWAY$