
-- Doc: https://docs.google.com/spreadsheets/d/1zJiNn9aItu6N0cjyWUxkYtC6Iv-eP45n-5w-U29EhNA/edit#gid=1455844898

CREATE OR REPLACE FUNCTION date_modified_ts_upd()
    RETURNS TRIGGER AS
$BODY$

BEGIN
    new.date_modified := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    RETURN new;
END;
$BODY$
    LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION modified_date_time_ts_upd()
    RETURNS TRIGGER AS
$BODY$

BEGIN
    new.modified_date_time := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    RETURN new;
END;
$BODY$
    LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION updated_at_ts_upd()
    RETURNS TRIGGER AS
$BODY$

BEGIN
    new.updated_at := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    RETURN new;
END;
$BODY$
    LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION lastmodifieddate_ts_upd()
    RETURNS TRIGGER AS
$BODY$

BEGIN
    new.lastmodifieddate := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    RETURN new;
END;
$BODY$
    LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION last_updated_date_ts_upd()
    RETURNS TRIGGER AS
$BODY$

BEGIN
    new.last_updated_date := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    RETURN new;
END;
$BODY$
    LANGUAGE plpgsql;
