-- Fix BEFORE UPDATE trigger on entity_tags: DATE_PART('epoch', NOW()) returns
-- double precision (~1716908165.922) which is invalid for a TIMESTAMP column.
-- Replace with NOW() to produce a proper timestamp value.
CREATE OR REPLACE FUNCTION job_new.trigger_set_date_modified_lowercase_tag_key_entity_tag() RETURNS TRIGGER
    LANGUAGE plpgsql
AS
$$
BEGIN
    new.date_modified = NOW();
    new.tag_key = LOWER(new.tag_key);

    RETURN new;
END;
$$;
