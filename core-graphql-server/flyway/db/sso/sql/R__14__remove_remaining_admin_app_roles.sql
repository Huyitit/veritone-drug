-- Flyway Repeatable Migration: Cleanup and Sync Remaining Admin App Roles
--
-- DESCRIPTION:
-- This repeatable migration ensures all users, including previously exempted internal accounts,
-- are fully migrated from legacy Admin App roles to Admin Center roles before the final deprecation.
--
-- REASON FOR REPEATABLE:
-- Repeatable to support ticket: https://veritone.atlassian.net/browse/VE-20183
-- Ensures full cleanup of legacy Admin App roles before dependent migration runs.
-- Safe to run multiple times to prevent reintroducing stale data across environments.

WITH role_mapping (legacy_role, new_role) AS (
    VALUES
        ('3459c3de-493f-443a-8ad0-ddb9f3f6c76d'::uuid, 'cb18eb9c-3264-434a-8a8d-e6b2d680f66e'::uuid),
        ('37b18322-74bf-4ae4-a46f-2cc407a9966c'::uuid, '79ebbe4e-3837-4e9a-863d-8dd2d181af07'::uuid),
        ('ddca9b68-d775-4934-8ffd-7aecc779b652'::uuid, '032218c3-d47e-4287-9d16-7bb867c01266'::uuid)
),
cleanup_candidates_for_insert AS (
    SELECT
        sur.user_id,
        rm.new_role AS new_role_id,
        sur.application_id,
        sur.date_created,
        sur.created_by
    FROM
        sso_user_role sur
    JOIN
        role_mapping rm ON sur.role_id = rm.legacy_role
),
users_to_insert_new_role AS (
    SELECT
        c.user_id,
        c.new_role_id AS role_id,
        c.application_id,
        c.date_created,
        c.created_by
    FROM
        cleanup_candidates_for_insert c
    LEFT JOIN
        sso_user_role existing_new_role ON
            c.user_id = existing_new_role.user_id
            AND c.new_role_id = existing_new_role.role_id
    WHERE
        existing_new_role.user_id IS NULL
)

INSERT INTO sso_user_role (
    user_id,
    role_id,
    application_id,
    date_created,
    created_by
)
SELECT
    user_id,
    role_id,
    application_id,
    date_created,
    created_by
FROM users_to_insert_new_role
ON CONFLICT (user_id, role_id, application_id) DO NOTHING;

DELETE FROM sso_user_role
WHERE role_id IN (
    '3459c3de-493f-443a-8ad0-ddb9f3f6c76d'::uuid,
    '37b18322-74bf-4ae4-a46f-2cc407a9966c'::uuid,
    'ddca9b68-d775-4934-8ffd-7aecc779b652'::uuid
);
