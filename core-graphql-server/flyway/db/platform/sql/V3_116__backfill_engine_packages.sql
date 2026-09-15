DO $$
DECLARE
    engine RECORD;
    engine_schema RECORD;
    new_package_id UUID;
    iterator float4 := 0;
BEGIN
    -- create a package for all deployed engines that do not have a package already created for it
    FOR engine in (
        SELECT
            e.engine_id, e.owner_organization_id, e.is_public, b.build_id
        FROM job_new.engine e
        INNER JOIN job_new.build b
            ON e.engine_id = b.engine_id
        LEFT JOIN aiware.package__primary_resource
            ON resource_id = e.engine_id
        WHERE
            resource_id IS NULL AND
            build_state = 'deployed'
    ) LOOP
        -- create package
        INSERT INTO aiware.package (
            package_id,
            organization_id,
            package_name,
            package_version,
            distribution_type,
            date_created,
            date_modified,
            created_by,
            modified_by
        )
        VALUES (
            uuid_generate_v4(),
            engine.owner_organization_id,
            CONCAT(RIGHT(engine.engine_id, 12), ' - ', engine.owner_organization_id, ' - ', EXTRACT(EPOCH FROM DATE_TRUNC('second', NOW() AT TIME ZONE 'utc')) * 10000 + iterator, ' - engine package 1.0'),
            '1.0',
            CASE WHEN engine.is_public THEN 'public'::job_new.distribution_type ELSE 'private'::job_new.distribution_type END,
            NOW(),
            NOW(),
            'ed075985-bc94-406b-8639-44d1da42c3fb',
            'ed075985-bc94-406b-8639-44d1da42c3fb'
        )
        RETURNING package_id INTO new_package_id;

        iterator := iterator + 1;

        -- add engine as resource to new package
        INSERT INTO aiware.package__resource (
            package_id,
            resource_id,
            resource_type,
            date_created,
            date_modified,
            created_by,
            modified_by
        )
        VALUES (
            new_package_id,
            engine.engine_id,
            'engine'::aiware.aiw_package_resource_enum,
            NOW(),
            NOW(),
            'ed075985-bc94-406b-8639-44d1da42c3fb',
            'ed075985-bc94-406b-8639-44d1da42c3fb'
        );

        -- add deployed build as resource to new package
        INSERT INTO aiware.package__resource (
            package_id,
            resource_id,
            resource_type,
            date_created,
            date_modified,
            created_by,
            modified_by
        )
        VALUES (
            new_package_id,
            engine.build_id,
            'engine_build'::aiware.aiw_package_resource_enum,
            NOW(),
            NOW(),
            'ed075985-bc94-406b-8639-44d1da42c3fb',
            'ed075985-bc94-406b-8639-44d1da42c3fb'
        );

        -- associate engine resource as the primary resource for the new package
        INSERT INTO aiware.package__primary_resource (
            package_id,
            resource_id,
            date_created,
            date_modified,
            created_by,
            modified_by
        )
        VALUES (
            new_package_id,
            engine.engine_id,
            NOW(),
            NOW(),
            'ed075985-bc94-406b-8639-44d1da42c3fb',
            'ed075985-bc94-406b-8639-44d1da42c3fb'
        );

        -- add any existing schemas for the engine as a resource for the new package
        FOR engine_schema in (SELECT schema_id FROM job_new.engine__schema WHERE engine_id = engine.engine_id) LOOP
            INSERT INTO aiware.package__resource (
                package_id,
                resource_id,
                resource_type,
                date_created,
                date_modified,
                created_by,
                modified_by
            )
            VALUES (
                new_package_id,
                engine_schema.schema_id,
                'schema'::aiware.aiw_package_resource_enum,
                NOW(),
                NOW(),
                'ed075985-bc94-406b-8639-44d1da42c3fb',
                'ed075985-bc94-406b-8639-44d1da42c3fb'
            );
        END LOOP;
    END LOOP;
END
$$;
