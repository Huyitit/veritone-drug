
-- Doc: https://docs.google.com/spreadsheets/d/1zJiNn9aItu6N0cjyWUxkYtC6Iv-eP45n-5w-U29EhNA/edit#gid=1455844898

-- 1. updated_date_int_upd
CREATE OR REPLACE FUNCTION updated_date_int_upd()
  RETURNS TRIGGER AS
$BODY$

BEGIN 
  new.updated_date := date_part('epoch'::text, now()); 
  RETURN NEW;
END;
$BODY$
LANGUAGE plpgsql;

-- 2. modified_date_time_ts_upd
CREATE OR REPLACE FUNCTION modified_date_time_ts_upd()
  RETURNS TRIGGER AS
$BODY$

BEGIN 
  new.modified_date_time := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
  RETURN NEW;
END;
$BODY$
LANGUAGE plpgsql;

-- 3. modified_date_time_int_upd: column - updated_date (google sheet) --> modified_date_time
CREATE OR REPLACE FUNCTION modified_date_time_int_upd()
  RETURNS TRIGGER AS
$BODY$

BEGIN 
  new.modified_date_time := date_part('epoch'::text, now()); 
  RETURN NEW;
END;
$BODY$
LANGUAGE plpgsql;

-- 4. updated_date_time_ts_upd
CREATE OR REPLACE FUNCTION updated_date_time_ts_upd()
  RETURNS TRIGGER AS
$BODY$

BEGIN 
  new.updated_date_time := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
  RETURN NEW;
END;
$BODY$
LANGUAGE plpgsql;
