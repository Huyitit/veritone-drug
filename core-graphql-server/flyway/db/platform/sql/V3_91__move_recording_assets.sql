DO
$do$
    DECLARE
        startWeek      integer;
        stopWeek      bigint;
        partitionDate  date;
        partitionName  varchar;
        msg varchar;
        sql text;
        count bigint;
    BEGIN
        startWeek = 22; -- 215 / 20
        stopWeek = 250;

        LOOP
            startWeek = startWeek + 1;
            if startWeek > stopWeek THEN
                EXIT;
            END IF;
            partitionDate = (date '2018-10-22T00:00:00.000Z' + make_interval(0, 0, startWeek - 20));

            partitionName = 'recording_asset_' || 
                EXTRACT(YEAR FROM partitionDate) || '_' || 
                lpad(EXTRACT(MONTH FROM partitionDate)::text, 2, '0') || '_' || 
                lpad(EXTRACT(WEEK FROM partitionDate)::text, 2, '0');

            -- see if the parition table exist
            IF NOT EXISTS(
                    SELECT
                    FROM information_schema.tables
                    WHERE table_schema = 'recording'
                      AND table_name = partitionName
                ) THEN
                    msg = 'Error Partition table ' || partitionName || 'does not exist';
                    RAISE NOTICE '%',msg;
                CONTINUE;
            END IF;

            RAISE NOTICE 'Scanning % as week % with IDs % to %', partitionName, startWeek, (startWeek::bigint * 10000000::bigint)::bigint, ((startWeek::bigint+1::bigint)::bigint * 10000000::bigint)::bigint;

            -- check count
            count = (SELECT count(*) FROM ONLY recording.recording_asset WHERE recording_id::bigint >= (startWeek::bigint * 10000000::bigint)::bigint AND recording_id::bigint < (startWeek::bigint + 1::bigint)::bigint * 10000000::bigint);
            IF count < 1 THEN
                RAISE NOTICE 'Skipping % as there are % rows', partitionName, count;
                CONTINUE;
            ELSE
                RAISE NOTICE 'Processing % as there are % rows', partitionName, count;
            END IF;

            -- put in right place
            sql = 'INSERT INTO recording.' || partitionName || ' SELECT * FROM ONLY recording.recording_asset WHERE recording_id::bigint >= ' || startWeek || '::bigint * 10000000::bigint AND recording_id::bigint < ((' || startWeek || '::bigint + 1::bigint) * 10000000::bigint)::bigint ON CONFLICT DO NOTHING';
            RAISE NOTICE 'INSERT: %',sql;
            EXECUTE(sql);

            -- DELETE from roottable
            RAISE NOTICE 'REMOVING: %', partitionDate;
            DELETE FROM ONLY recording.recording_asset WHERE recording_id::bigint >= (startWeek::bigint * 10000000::bigint)::bigint
              AND recording_id::bigint < (startWeek::bigint + 1::bigint)::bigint * 10000000::bigint;

        END LOOP;
    END;

$do$;