DO $FLYWAY$
BEGIN

  -- 
  ALTER TABLE public.organization_invite ALTER COLUMN user_id DROP NOT NULL;

END;
$FLYWAY$