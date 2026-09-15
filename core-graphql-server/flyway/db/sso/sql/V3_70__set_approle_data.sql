-- +------------------------------------+------------------------+-----------------+--------------+
-- |role_id                             |role_name               |app_name         |application_id|
-- +------------------------------------+------------------------+-----------------+--------------+
-- |40c94f70-39d7-4340-bd15-acdf44ca34c5|Developer Sandbox Editor|developer_sandbox|null          |
-- |37b18322-74bf-4ae4-a46f-2cc407a9966c|Finance Admin           |null             |null          |
-- |ddf6f444-eaf0-4ee3-bded-98776e5fee0f|CI Tester               |null             |null          |
-- |22458fdf-be0b-48fb-b5bf-feeff81f700b|Can tv test app Viewer  |cantv_app_11     |null          |
-- |13634222-b879-4677-be03-d4ecad8fb2c2|No App Access           |null             |null          |
-- |5e9cfff9-4652-4755-ae49-796615079375|Default App Access      |null             |null          |
-- +------------------------------------+------------------------+-----------------+--------------+

-- Add app associations for ones that don't have them
-- Finance Admin
UPDATE role SET app_name = 'admin', application_id = 'ea1d26ab-0d29-4e97-8ae7-d998a243374e'
WHERE role_id = '37b18322-74bf-4ae4-a46f-2cc407a9966c';

-- No App Access
UPDATE role SET app_name = 'admin', application_id = 'ea1d26ab-0d29-4e97-8ae7-d998a243374e'
WHERE role_id = '13634222-b879-4677-be03-d4ecad8fb2c2';

-- Default App Access
UPDATE role SET app_name = 'developer_sandbox', application_id = 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0'
WHERE role_id = '40c94f70-39d7-4340-bd15-acdf44ca34c5';

-- Add CI Test Application
INSERT INTO public.application (
    application_id,
    application_name,
    application_key,
    application_status,
    application_description,
    application_icon_url,
    application_icon_svg,
    application_url,
    application_check_permissions,
    application_order,
    owner_organization_id,
    public
) SELECT
             '674c5d24-6c80-4106-8f34-cb1d19cdc1d5',
             'CI Test',
             'ci_test',
             'active',
             'CI Test application.',
             'https://static.veritone.com/developer-app.png',
             'https://static.veritone.com/veritone-ui/app-icons-svg/developer-app.svg',
             '',
             TRUE,
             10,
             @@{ROOT_ORG_ID}@@,
             FALSE
WHERE '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
ON CONFLICT DO NOTHING;

-- Default App Access
UPDATE role SET app_name = 'ci_test', application_id = '674c5d24-6c80-4106-8f34-cb1d19cdc1d5'
WHERE role_id = 'ddf6f444-eaf0-4ee3-bded-98776e5fee0f';

-- Set roles
UPDATE role SET application_id =
(SELECT application_id FROM application WHERE application_key = role.app_name)
WHERE application_id IS NULL;

-- Move all blank application_ids to Admin App
UPDATE role SET app_name = 'admin', application_id = 'ea1d26ab-0d29-4e97-8ae7-d998a243374e'
WHERE application_id IS NULL;

DELETE FROM role WHERE application_id IS NULL;
