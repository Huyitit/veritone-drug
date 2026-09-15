CREATE OR REPLACE FUNCTION public.media_weekly_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
        DECLARE
            base_date   date;
            week_offset bigint;
            days_diff   bigint;
            weeks_diff   bigint;

            base_val    bigint;
            next_val    bigint;
        BEGIN
            -- W,WW0,000,000 - format
            -- 2,147 483 647 - max signed int4
            -- 0,200,000,000 - proposed start for PROD (at offset start 020, max 214 with 7.48m ids)
            ---0,400,127,638 - (proposed start: WWW=044) max recording id in DEV (as of oct. 17, 2018)
            -- 0,400,009,602 - (proposed start: WWW=041) max recording id in STAGE (as of oct. 24, 2018)
            -- 0,119,822,400 - (proposed start: WWW=020) max recording id in PROD (as of oct. 26, 2018)
            -- 0,500,132,931 -- (proposed start: WWW=052) max recording id in UK-PROD (as of oct. 26, 2018)
            -- base_val is the minimal value of the sequence for the current week: WWW0000000
            base_date := date('2018-10-22 +00:00'); -- week 43, 2018
            week_offset := 20; -- offset by, usually the next whole number of max recording of the ENV

            -- now() is a timestamp type, explicit cast to timestamp math
            days_diff := EXTRACT('days' FROM now() - base_date::timestamp);
            weeks_diff := (days_diff / 7)::bigint;

            base_val := (week_offset + weeks_diff) * 10000000;
            next_val := nextval('media_weekly_id_sequence');
            -- note: currval differs per db session, requires nextval
            -- which is atomic distinct.
            -- so if the next sequence is less, then update it and
            -- use that as new media id
            IF (next_val < base_val) THEN
                PERFORM setval('media_weekly_id_sequence', base_val);
                NEW.media_id := base_val;
            ELSE
                NEW.media_id := next_val;
            END IF;

            RETURN NEW;
        END; 
$function$;
