CREATE OR REPLACE FUNCTION trigger_set_modified_date_time_epoch() RETURNS TRIGGER
    LANGUAGE plpgsql
AS
$$
BEGIN
    new.modified_date_time = DATE_PART('epoch'::TEXT, NOW());

    RETURN new;
END;
$$;
