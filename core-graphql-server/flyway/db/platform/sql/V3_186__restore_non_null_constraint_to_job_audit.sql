DO $FLYWWAY$
BEGIN
  IF
    (SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'job_new' AND table_name = 'job_audit' AND column_name = 'actor')
  THEN
        UPDATE job_new.job_audit
        SET actor = '00000000-0000-0000-0000-000000000000'
        WHERE actor IS NULL;

        ALTER TABLE job_new.job_audit ALTER COLUMN actor SET NOT NULL;
  END IF;
END;
$FLYWWAY$
