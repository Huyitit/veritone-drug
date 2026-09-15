DO $FLYWAY$
BEGIN
    -- Add test token for testing application routes
    INSERT INTO
        sso_token (token_id, application_id, group_id, json, user_id)
    VALUES
        (
            'citest_service_token:dbd399ece3554c9d9fa3d1015e743b5858468ad2eeb540f2b58556ff69562c50',
            null,
            null,
            '{"tokenLabel":"citest_service_token:organization:@@{ROOT_ORG_ID}@@:aiWARE Hub","rights":["developer.access","developer.engine.read","developer.engine.create","developer.build.read","developer.build.create","developer.build.approve","developer.engine.update"],"internal":true,"tokenId":"citest_service_token:dbd399ece3554c9d9fa3d1015e743b5858468ad2eeb540f2b58556ff69562c50","applicationId":"165b27ac-338c-4125-8f7e-77a014f2a611"}',
            null
        )
    ON CONFLICT (token_id) DO
    UPDATE
    SET
        application_id = excluded.application_id,
        group_id = excluded.group_id,
        "json" = excluded."json",
        user_id = excluded.user_id;
END;
$FLYWAY$
