DO $FLYWWAY$
BEGIN
  DO $$
  DECLARE
    tempRow RECORD;
    partitionName TEXT;
    firstDayOfWeek DATE;
  BEGIN
    firstDayOfWeek := date_trunc('week', NOW()::TIMESTAMP);
    FOR tempRow IN
      SELECT 	'shared_url_' || to_char(generate_series, 'YYYY_MM_IW') AS name
      FROM 	generate_series(firstDayOfWeek, firstDayOfWeek + interval '14 days', '1 week')
    LOOP
      partitionName := temprow.name;
      
      IF EXISTS(SELECT relname FROM pg_class WHERE relname = partitionName) THEN
        RAISE NOTICE E'\nshare.% table already exists!', partitionName;
      ELSE
        RAISE NOTICE E'\nCreating table share.%', partitionName;
        EXECUTE 'CREATE TABLE IF NOT EXISTS share.' || partitionName || ' (
          CONSTRAINT ' || partitionName || '_no_duplicates
          UNIQUE (source_id, tdo_id, scheduled_job_id, start_date_time, stop_date_time, start_offset_ms, stop_offset_ms, settings, service_name, media_type)
        ) INHERITS (public.shared_url);';
        EXECUTE 'ALTER TABLE share.' || partitionName || ' ADD PRIMARY KEY (id);';
        EXECUTE 'CREATE INDEX idx_' || partitionName || '_created_date_time ON share.' || partitionName || ' (created_date_time);';
        EXECUTE 'CREATE TRIGGER update_date_modified BEFORE UPDATE ON share.' || partitionName || '
          FOR EACH ROW EXECUTE PROCEDURE modified_date_time_modified_column();';
        EXECUTE 'ALTER TABLE share.' || partitionName || ' OWNER TO postgres;';
      END IF;
    END LOOP;
  END;
  $$
  LANGUAGE plpgsql;
END;
$FLYWWAY$