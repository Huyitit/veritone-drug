WITH legacy_to_new_roles (legacy_role, new_role) AS (
    VALUES
        -- Legacy SuperAdmin to new SuperAdmin 
        ('3459c3de-493f-443a-8ad0-ddb9f3f6c76d'::uuid, 'cb18eb9c-3264-434a-8a8d-e6b2d680f66e'::uuid),
        -- Legacy FinanceAdmin to new Finance Admin
        ('37b18322-74bf-4ae4-a46f-2cc407a9966c'::uuid, '79ebbe4e-3837-4e9a-863d-8dd2d181af07'::uuid),
        -- Legacy Admin to new Admin
        ('ddca9b68-d775-4934-8ffd-7aecc779b652'::uuid, '032218c3-d47e-4287-9d16-7bb867c01266'::uuid)
),
rows_to_insert AS (
    SELECT
        t.user_id::uuid,
        l.new_role::uuid AS role_id,
        t.date_created::timestamp,
        t.created_by::uuid,
        t.application_id::uuid
    FROM
        sso_user_role t
    JOIN
        legacy_to_new_roles l ON t.role_id = l.legacy_role
)
INSERT INTO sso_user_role (user_id, role_id, date_created, created_by, application_id)
SELECT * FROM rows_to_insert
ON CONFLICT (user_id, role_id, application_id) DO NOTHING;