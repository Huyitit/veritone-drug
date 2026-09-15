DO $FLYWWAY$
BEGIN
  --------- Job partition
  do $$
  declare
    tempRow RECORD;
    partitionName text;
    firstDayOfWeek date;
    fromDate date;
    toDate date;
  begin
    firstDayOfWeek := date_trunc('week', now()::timestamp);
    for tempRow in
      select 	'job_' || to_char(generate_series, 'YYYY_MM_IW') as name,
          date_trunc('week', generate_series::timestamp) as fromDate,
          date_trunc('week', generate_series::timestamp) + interval '7 days' as toDate
      from 	generate_series(firstDayOfWeek, firstDayOfWeek + interval '14 days', '1 week')
    loop
      partitionName := tempRow.name;
      fromDate := tempRow.fromDate;
      toDate := tempRow.toDate; 
      
      if exists(select relname from pg_class where relname = partitionName) then
        RAISE NOTICE E'\njob.% table already exists!', partitionName;
      else
        RAISE NOTICE E'\nCreating table job.%', partitionName;
        execute 'CREATE TABLE IF NOT EXISTS job_new.' || partitionName || ' (
                CHECK ( created_date_time >= ' || fromDate || ' and created_date_time < ' || toDate || ' )
            ) INHERITS (job_new.job);';
            execute 'ALTER TABLE job_new.' || partitionName || ' ADD PRIMARY KEY (job_id);';
            execute 'ALTER TABLE job_new.' || partitionName || ' owner TO postgres;';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@_ix_job_cluster_id" ON job_new.' || partitionName || ' USING btree (cluster_id,created_date_time);';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@application_id" ON job_new.' || partitionName || ' USING btree (application_id);';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@application_id,created_date_time"
              ON job_new.' || partitionName || ' USING btree (application_id, created_date_time);';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@bundle_id" ON job_new.' || partitionName || ' USING btree (bundle_id);';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@created_date_time" ON job_new.' || partitionName || ' USING btree (created_date_time DESC);';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@job_pipeline_id" ON job_new.' || partitionName || ' USING btree (job_pipeline_id);';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@modified_date_time" ON job_new.' || partitionName || ' USING btree (modified_date_time);';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@recording_id" ON job_new.' || partitionName || ' USING btree (recording_id);';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@scheduled_job_id" ON job_new.' || partitionName || ' USING btree (scheduled_job_id);';
      end if;
    end loop;
  end;
  $$
  language plpgsql;

  
  
  --------- Task partition
  do $$
  declare
    tempRow RECORD;
    partitionName text;
    firstDayOfWeek date;
    fromDate date;
    toDate date;
    idxLookUp text;
  begin
    firstDayOfWeek := date_trunc('week', now()::timestamp);
    for tempRow in
      select 	'task_' || to_char(generate_series, 'YYYY_MM_IW') as name,
          date_trunc('week', generate_series::timestamp) as fromDate,
          date_trunc('week', generate_series::timestamp) + interval '7 days' as toDate,
          'idx_task__lookup2_' || to_char(generate_series, 'YYYY_MM_IW') as indexLookUp
      from 	generate_series(firstDayOfWeek, firstDayOfWeek + interval '14 days', '1 week')
    loop
      partitionName := tempRow.name;
      fromDate := tempRow.fromDate;
      toDate := tempRow.toDate;
      idxLookUp := tempRow.indexLookUp;
      
      if exists(select relname from pg_class where relname = partitionName) then
        RAISE NOTICE E'\ntask.% table already exists!', partitionName;
      else
        RAISE NOTICE E'\nCreating table task.%', partitionName;
        execute 'CREATE TABLE IF NOT EXISTS job_new.' || partitionName || ' (
                CHECK ( created_date_time >= ' || fromDate || ' and created_date_time < ' || toDate || ' )
            ) INHERITS (job_new.task);';
            execute 'ALTER TABLE job_new.' || partitionName || ' ADD PRIMARY KEY (task_id);';
            execute 'ALTER TABLE job_new.' || partitionName || ' owner TO postgres;';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@application_id,created_date_time,task_status"
              ON job_new.' || partitionName || ' USING btree (application_id, created_date_time, task_status);';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@job_id" ON job_new.' || partitionName || ' USING btree (job_id);';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@created_date_time" ON job_new.' || partitionName || ' USING btree (created_date_time);';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@modified_date_time" ON job_new.' || partitionName || ' USING btree (modified_date_time);';
            execute 'CREATE INDEX IF NOT EXISTS "job_new.' || partitionName || '@recording_id" ON job_new.' || partitionName || ' USING btree (recording_id) ;';
            execute 'CREATE INDEX IF NOT EXISTS "' || idxLookUp || '" ON job_new.' || partitionName || ' USING btree (job_id, created_date_time DESC);';
            
                                   
      end if;
    end loop;
  end;
  $$
  language plpgsql;

  
  
  --------- Recording asset partition
  do $$
  declare
    tempRow RECORD;
    partitionName text;
    firstDayOfWeek date;
    fromDate date;
    weekdiff bigint;
    currentPartitionStartId bigint;
    nextPartitionStartId bigint;
  begin
    firstDayOfWeek := date_trunc('week', now()::timestamp);
    for tempRow in
      select 	'recording_asset_' || to_char(generate_series, 'YYYY_MM_IW') as name,
          date_trunc('week', generate_series::timestamp) as fromDate
      from 	generate_series(firstDayOfWeek, firstDayOfWeek + interval '14 days', '1 week')
    loop
      partitionName := tempRow.name;
      fromDate := tempRow.fromDate;
      weekdiff := TRUNC(DATE_PART('day', fromDate::timestamp - '2018-10-22'::timestamp)/7); --- '2018-10-22' is the base date
      currentPartitionStartId := (20 + weekdiff) * 10000000; -- 20 is offset of relative week to start from
      nextPartitionStartId := (20 + weekdiff + 1) * 10000000;
      
      if exists(select relname from pg_class where relname = partitionName) then
        RAISE NOTICE E'\nrecording.% table already exists!', partitionName;
      else
        RAISE NOTICE E'\nCreating table recording.%', partitionName;
        execute 'CREATE TABLE IF NOT EXISTS recording.' || partitionName || ' (
                CHECK (recording_id::int >= ' || currentPartitionStartId || ' and recording_id::int < ' || nextPartitionStartId || ' )
            ) INHERITS (recording.recording_asset);';
            execute 'ALTER TABLE recording.' || partitionName || ' ADD PRIMARY KEY (asset_id);';
            execute 'ALTER TABLE recording.' || partitionName || ' owner TO postgres;';
            execute 'CREATE INDEX IF NOT EXISTS "_ix_recording.' || partitionName || '@recording_id" ON recording.' || partitionName || ' USING btree (recording_id);';
            execute 'CREATE INDEX IF NOT EXISTS "_ix_recording.' || partitionName || '@created_date_time" ON recording.' || partitionName || ' USING btree (created_date_time);';
      end if;
    end loop;
  end;
  $$
  language plpgsql;

END;
$FLYWWAY$
