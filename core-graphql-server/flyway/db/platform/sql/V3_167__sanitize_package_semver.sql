DO $$
DECLARE 
    version TEXT;
    new_version TEXT;
    origin_id uuid;
    patch_counter INTEGER;
    row RECORD;
BEGIN
    -- Create a temporary table for counters
    CREATE TEMPORARY TABLE IF NOT EXISTS patch_counters(
        source_origin_id uuid PRIMARY KEY,
        counter INTEGER NOT NULL DEFAULT 0
    );

    -- Iterate over each unique version and origin_id, ordered by date_created
    FOR row IN (
        SELECT DISTINCT ON (package_version, source_origin_id) 
            package_version, 
            source_origin_id, 
            date_created 
        FROM aiware.package 
        ORDER BY package_version, source_origin_id, date_created
    ) LOOP
        version := row.package_version;
        origin_id := row.source_origin_id;

        -- Extract the first semver-like substring from the version string
        new_version := (SELECT (REGEXP_MATCHES(version, '([0-9]+(\.[0-9]+){0,2})'))[1]);

        -- If no semver-like substring was found, set to 1.0.x based on current loop iteration
        IF new_version IS NULL THEN
            -- Check if there's already a counter for this origin_id
            SELECT counter INTO patch_counter FROM patch_counters WHERE source_origin_id = origin_id;
            IF NOT FOUND THEN
                -- If there's no counter, initialize one
                INSERT INTO patch_counters(source_origin_id, counter) VALUES (origin_id, 0);
                patch_counter := 0;
            END IF;
            new_version := '1.0.' || patch_counter::TEXT;

            -- Increment the counter for this origin_id
            UPDATE patch_counters SET counter = counter + 1 WHERE source_origin_id = origin_id;
        END IF;
        
        -- Pad the version with .0 components as necessary to make it a full MAJOR.MINOR.PATCH version
        new_version := new_version || REPEAT('.0', 2 - LENGTH(new_version) + LENGTH(REPLACE(new_version, '.', '')));

        -- Update the package_version in the database
        UPDATE aiware.package 
        SET package_version = new_version 
        WHERE package_version = version AND source_origin_id = origin_id AND NOT EXISTS (
            SELECT 1 FROM aiware.package AS p WHERE p.package_version = new_version AND p.source_origin_id = origin_id 
        );
    END LOOP;

    -- Drop the temporary table
    DROP TABLE patch_counters;

END 

$$;
