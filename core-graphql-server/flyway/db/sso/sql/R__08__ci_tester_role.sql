INSERT INTO role (role_id, role_name, role_description, permissions, organization_id,
                  is_private, application_id)
SELECT
  'ddf6f444-eaf0-4ee3-bded-98776e5fee0f',
  'CI Tester',
  'For test user to run CI tests in Jenkins',  
  '{-67100674, 4128831, -1071874560, 1308622847, 0, 0, 0, 536870912}',
  null,
  FALSE,
  '674c5d24-6c80-4106-8f34-cb1d19cdc1d5'
WHERE
  '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
ON CONFLICT (role_id) DO UPDATE
  SET permissions = '{-67100674, 4128831, -1071874560, 1308622847, 0, 0, 0, 536870912}',
      application_id = '674c5d24-6c80-4106-8f34-cb1d19cdc1d5';