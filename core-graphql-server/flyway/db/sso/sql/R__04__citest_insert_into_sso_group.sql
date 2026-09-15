-- citests/source.js

INSERT INTO sso_application (
    application_id,
    application_name,
    date_created,
    kvp,
    is_platform
)
SELECT
    '2fea6db8-87b9-4118-b0df-ac176f5538de',
    '5/13 Test Org 12:02PM-default-2df272',
    '2017-05-13 19:03:02.988315',
    '{"platformType":"enterprise"}',
    false
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;

INSERT INTO sso_application (
    application_id,
    application_name,
    date_created,
    kvp,
    is_platform
)
SELECT
    'e3c8088c-dd57-42f6-a7ec-be800ec9ba8c',
    '10/4/2017 - Test Orgs-default',
    '2017-10-04 21:25:09.551748',
    '{"platformType":"enterprise"}',
    false
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;


INSERT INTO sso_group (
    group_id,
    group_name,
    application_id,
    kvp,
    date_created,
    date_modified,
    modified_by,
    permissions
) SELECT
    '22147d83-daf0-4299-b0ca-5fab860dc3c6',
    '10/4/2017 - Test Orgs',
    'e3c8088c-dd57-42f6-a7ec-be800ec9ba8c',
    '{"groupType":"organization","organizationName":"10/4/2017 - Test Orgs","organizationId":"14954"}',
    '2017-10-04 21:25:09.551748',
    '2017-12-05 23:06:17',
    '5712c82e-65a5-41b2-8815-22162610a62f',
    '{"cms":{"access":"true"}}'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;


INSERT INTO sso_group (
    group_id,
    group_name,
    application_id,
    kvp,
    date_created,
    date_modified,
    modified_by,
    permissions
) SELECT
    '40af2887-54e2-4471-9991-6e099b16af23',
    '5/13 Test Org 12:02PM',
    '2fea6db8-87b9-4118-b0df-ac176f5538de',
    '{"groupType":"organization","organizationName":"5/13 Test Org 12:02PM","organizationId":"14525"}',
    '2017-05-13 19:03:02.988315',
    '2017-05-13 19:03:02.988315',
    '5712c82e-65a5-41b2-8815-22162610a62f',
    '{"cms":{"access":"true"}}'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;
