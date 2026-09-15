CREATE OR REPLACE FUNCTION public.last_updated_date_ts_upd()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
DECLARE
    changed hstore;
    fields text[];
BEGIN
    -- Process:
    -- 1. update last_updated_date

    IF TG_OP = 'INSERT' THEN 
        new.last_updated_date = NOW();
    ELSE 
        changed = hstore(NEW) - hstore(OLD);
        fields = akeys(changed);

        -- if only order_index is updated, the date_modified column is unchanged.
        IF array_length(fields, 1) = 1 AND fields @> ARRAY['order_index'] THEN 
            new.last_updated_date = old.last_updated_date;
        ELSE
            new.last_updated_date = NOW();
        END IF;
    END IF;

    RETURN new;
END;
$$;
