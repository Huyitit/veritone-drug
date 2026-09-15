-- citest/workflow.js
 
INSERT INTO workflow.workflow_runtime (
  workflow_runtime_id,
  organization_id,
  runtime_type,
  host_uri,
  created_by,
  updated_by,
  created_at,
  updated_at
) VALUES (
	'citest_runtime_org_7682',
	7682,
	'node-red',
	'https://nr7682-workflow.aws-dev.veritone.com',
	'ccccbf38-29d2-4e97-aacf-0cfea0aef687',
	'e71f0348-c760-4eac-bab5-766b8a9df314',
	'2018-10-30 20:10:47.411596+00',
	'2020-02-25 09:52:28.485556+00'
)
ON CONFLICT DO NOTHING;