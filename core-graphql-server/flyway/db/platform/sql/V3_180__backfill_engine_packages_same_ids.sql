DO $$
DECLARE
    engine_package_default RECORD;
    v1_engine_package RECORD;
BEGIN
    -- A - Update package IDs for default engine
    -- Steps to do:
        -- 1. Create a temp table: default engine IDs and default package IDs
        -- 2. Create another temp table to store engines need to create package for.
        -- 3. Create packages for engine by default package Ids
        -- 4. Replace package ID by the default package ID
        -- 5. Delete the old packages

    -- 1. Temp table: default engine IDs and default package IDs
    DROP TABLE IF EXISTS default_package_ids;
    CREATE TEMP TABLE default_package_ids(engine_id VARCHAR, package_id uuid);

    INSERT INTO default_package_ids 
    VALUES 
         ('2517dfe9-b70d-43b1-bc1b-800618190d92',  '71f3f5c7-3641-4776-a3c4-075f613b4f9b') -- Benchmark Engines RT
    	,('352556c7-de07-4d55-b33f-74b1cf237f25',  '4fb5fe95-dfc5-41c0-b179-045787dba469') -- SI2 Playback segment creator 
    	,('409938ee-b02c-461f-bece-94c90e4a1a84',  'c82303d6-ae96-4990-8b7b-da88f131d2ef') -- Illuminate Upload Engine Batch
    	,('414eb717-388e-4082-9a04-65dec0b739bd',  '18331028-7dd5-4960-80a9-3718a680d8af') -- Illuminate Export to Desktop
    	,('74dfd76b-472a-48f0-8395-c7e01dd7f255',  '28db29ee-1e1f-4837-9c27-acfdc386a69b') -- TV and Radio Adapter
    	,('75fc943b-b5b0-4fe1-bcb6-9a7e1884257a',  'faacbcd0-3a78-4c55-af48-16b508dca808') -- SI2 Stream Asset Creator
    	,('8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440',  '8f99b141-7d7b-420f-9f0e-ad34b0bddf51') -- SI2 audio/video Chunk creator
    	,('8ce0226b-8d5a-4a2a-8820-feddd60b5c1c',  'ef1e257b-26c8-406e-a652-d54aeee5527d') -- task-export-to-local-batch
    	,('8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3',  'b1c9a5b3-ce23-44ee-891d-e3b7605fc36a') -- Output Writer
    	,('9e611ad7-2d3b-48f6-a51b-0a1ba40fe255',  '58e278b2-a0fd-498e-9064-836cfb541b18') -- Webstream Adapter
    	,('a38676f6-7557-4ba1-a544-c4020f800778',  '68ee20c5-a627-49e5-bcee-ec0d32852366') -- File Translator V3F
    	,('ab682a42-ffdb-40cd-a8f7-432905f0a5a1',  '7ce6767e-dbc0-428c-9c63-96ed601a28d9') -- Machinebox - Facebox Similarity
    	,('c0e55cde-340b-44d7-bb42-2e0d65e98255',  'cc2c73e9-a974-4e39-b818-a61519ed9626') -- Speechmatics - Transcription (v7) - English (Global)
    	,('cbd5fc84-781a-4e45-bdac-c8b4e9e1354f',  '51b4ec2c-3019-495e-a8ef-9ff4d4caca3a') -- Pangeanic - German to English
    	,('insert-into-index',                     'e0fb3134-c47c-4a2f-b996-50d87132a09d') -- Add to Index
    	-- ,('download-file',                         '53e0c7d8-28e7-49da-b487-3dea46f90c80') -- Download
    	-- ,('mention-generate',                      '713b8f75-b5e6-463f-a75f-87dddca4bec7') -- mention-generate
        ;
    
    -- 2. Create a new temp table to store engines need to create package for.
    DROP TABLE IF EXISTS tmp_create_packages;
    DROP TABLE IF EXISTS tmp_package_primary_resource;
    CREATE TEMP TABLE tmp_create_packages(engine_id VARCHAR, package_id uuid, old_package_id uuid);

    INSERT INTO tmp_create_packages(engine_id, package_id, old_package_id)
    SELECT dpi.engine_id, dpi.package_id, (SELECT ppr.package_id FROM aiware.package__primary_resource ppr WHERE ppr.resource_id = dpi.engine_id ORDER BY date_created ASC LIMIT 1) AS old_package_id
    FROM default_package_ids dpi
    WHERE NOT EXISTS (SELECT * FROM aiware.package WHERE package_id = dpi.package_id LIMIT 1);

    -- 3. Create packages for engine by default package Ids
    FOR engine_package_default in (
            SELECT engine_id, package_id, old_package_id
            FROM tmp_create_packages
            WHERE old_package_id IS NOT NULL
        ) LOOP

            -- 3.1. Rename old package
            UPDATE aiware.package 
                SET package_name = package_name || engine_package_default.old_package_id::TEXT
            WHERE package_id = engine_package_default.old_package_id;
            -- 3.2. Create new package with default ID
            INSERT INTO aiware.package(package_id, organization_id, package_name, package_description, package_version, source_package_id, distribution_type, date_created, date_modified, created_by, modified_by, source_origin_id, aiware_version, deleted, "status", package_icon, distribution_date, install_date, package_created_date, auto_generated, deprecated)
            SELECT engine_package_default.package_id, p.organization_id, REPLACE(p.package_name, engine_package_default.old_package_id::TEXT, ''), p.package_description, p.package_version, p.source_package_id, p.distribution_type, p.date_created, p.date_modified, p.created_by, p.modified_by, p.source_origin_id, p.aiware_version, p.deleted, p."status", p.package_icon, p.distribution_date, p.install_date, p.package_created_date, p.auto_generated, p.deprecated
            FROM aiware.package p
            WHERE p.package_id = engine_package_default.old_package_id
            ON CONFLICT DO NOTHING;

            -- 4. Replace package ID by the default package ID
            -- 4.1 package__primary_resource: backup and delete (if not an error will throw when updating package_resource table)
            DROP TABLE IF EXISTS tmp_package_primary_resource;
            CREATE TEMP TABLE tmp_package_primary_resource AS
            SELECT * FROM aiware.package__primary_resource
            WHERE package_id = engine_package_default.old_package_id LIMIT 1;
            -- Delete old data
            DELETE FROM aiware.package__primary_resource
            WHERE package_id = engine_package_default.old_package_id;

            -- 4.2 package__resource
            -- 4.2.1: package_id
            UPDATE aiware.package__resource 
                SET package_id = engine_package_default.package_id
            WHERE package_id = engine_package_default.old_package_id;
            -- 4.2.2: resource type is package
            UPDATE aiware.package__resource 
                SET resource_id = engine_package_default.package_id::text
            WHERE resource_type = 'package'::aiware."aiw_package_resource_enum" 
                AND resource_id = engine_package_default.old_package_id::text;

            -- 4.3 package__primary_resource: Insert new data with new package id
            INSERT INTO aiware.package__primary_resource
                (package_id, resource_id, date_created, date_modified, created_by, modified_by)
                SELECT engine_package_default.package_id::uuid, engine_package_default.engine_id::TEXT, date_created, date_modified, created_by, modified_by
                FROM tmp_package_primary_resource;

            -- 4.4. Update source_package_id/ source_origin_id
            -- Because this depends on the constraint "excl_resource_lineage_combination" from aiware.package__primary_resource
            UPDATE aiware.package 
                SET source_package_id = engine_package_default.package_id::uuid
            WHERE source_package_id = engine_package_default.old_package_id;

            UPDATE aiware.package 
                SET source_origin_id = engine_package_default.package_id::uuid
            WHERE source_origin_id = engine_package_default.old_package_id;
            -- The package should be the first version
            UPDATE aiware.package 
                SET source_package_id = NULL,
                source_origin_id = engine_package_default.package_id::uuid
            WHERE package_id = engine_package_default.package_id;

            -- 4.4 package__organization
            UPDATE aiware.package__organization 
                SET package_id = engine_package_default.package_id
            WHERE package_id = engine_package_default.old_package_id;

            -- 5. Delete old package
            DELETE FROM aiware.package
            WHERE package_id = engine_package_default.old_package_id;

    END LOOP;

    DROP TABLE IF EXISTS tmp_create_packages;

    -- B - Delete v1 engine: 'bulk-edit-transcript','download-file','mention-generate','transcode-ffmpeg'
    --     And delete packages as well

    -- 1. Mark obsolete engines as deleted
    UPDATE job_new.engine 
    SET engine_state = 'deleted', deleted = true 
    WHERE engine_id IN ('bulk-edit-transcript','download-file','mention-generate','transcode-ffmpeg');

    FOR v1_engine_package in (
            SELECT package_id
            FROM aiware.package__primary_resource
            WHERE resource_id IN ('bulk-edit-transcript','download-file','mention-generate','transcode-ffmpeg')
        ) LOOP

        -- 1.1. Delete package_organization
        DELETE FROM aiware.package__organization
        WHERE package_id = v1_engine_package.package_id;

        -- 1.2. Delete package: data in package__primary_resource, package__resource will be clean automatically
        DELETE FROM aiware.package
        WHERE package_id = v1_engine_package.package_id;

    END LOOP;
END
$$;
