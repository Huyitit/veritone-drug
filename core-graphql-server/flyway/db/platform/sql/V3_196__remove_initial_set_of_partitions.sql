DO $FLYWWAY$
BEGIN
  --------- Job partition
  do $$
  declare
    tempRow RECORD;
    partitionName text;
    firstDayOfWeek date;
  begin
    firstDayOfWeek := date_trunc('week', now()::timestamp);
    for tempRow in
      select 	'job_' || to_char(generate_series, 'YYYY_MM_IW') as name
      from 	generate_series(firstDayOfWeek, firstDayOfWeek + interval '14 days', '1 week')
    loop
      partitionName := tempRow.name;
      
      if exists(select relname from pg_stat_user_tables where relname = partitionName and n_live_tup <> 0) then
        RAISE NOTICE E'\njob_new.% table is not empty!', partitionName;
      else
        RAISE NOTICE E'\nDrop job table job_new.%', partitionName;
        execute 'DROP TABLE IF EXISTS job_new.' || partitionName || ' CASCADE;';
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
  begin
    firstDayOfWeek := date_trunc('week', now()::timestamp);
    for tempRow in
      select 	'task_' || to_char(generate_series, 'YYYY_MM_IW') as name
      from 	generate_series(firstDayOfWeek, firstDayOfWeek + interval '14 days', '1 week')
    loop
      partitionName := tempRow.name;
      
      if exists(select relname from pg_stat_user_tables where relname = partitionName and n_live_tup <> 0) then
        RAISE NOTICE E'\njob_new.% table is not empty!', partitionName;
      else
        RAISE NOTICE E'\nDrop task table job_new.%', partitionName;
        execute 'DROP TABLE IF EXISTS job_new.' || partitionName || ' CASCADE;';                       
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
  begin
    firstDayOfWeek := date_trunc('week', now()::timestamp);
    for tempRow in
      select 	'recording_asset_' || to_char(generate_series, 'YYYY_MM_IW') as name
      from 	generate_series(firstDayOfWeek, firstDayOfWeek + interval '14 days', '1 week')
    loop
      partitionName := tempRow.name;
      
      if exists(select relname from pg_stat_user_tables where relname = partitionName and n_live_tup <> 0) then
        RAISE NOTICE E'\nrecording.% table is not empty!', partitionName;
      else
        RAISE NOTICE E'\nDrop recording table recording.%', partitionName;
        execute 'DROP TABLE IF EXISTS recording.' || partitionName || ' CASCADE;';
      end if;
    end loop;
  end;
  $$
  language plpgsql;
END;
$FLYWWAY$
