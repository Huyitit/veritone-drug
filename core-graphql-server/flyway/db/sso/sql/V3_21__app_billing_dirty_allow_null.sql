DO $$
BEGIN
  IF EXISTS(SELECT *
    FROM information_schema.columns
    WHERE table_name='application__organization' and column_name='billing_dirty')
  THEN
      ALTER TABLE "public"."application__organization" 
      ALTER COLUMN "billing_dirty" DROP NOT NULL;
  END IF;
END $$;