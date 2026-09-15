DO $$
BEGIN
   IF NOT EXISTS (
      SELECT 1
      FROM   pg_constraint
      WHERE  conname = '_ix_application@application_name_and_org'
   )
   THEN
      ALTER TABLE public.application DROP CONSTRAINT IF EXISTS "_ix_application@application_name";
      ALTER TABLE public.application ADD CONSTRAINT "_ix_application@application_name_and_org" UNIQUE (owner_organization_id, application_name);
   END IF;
END
$$;