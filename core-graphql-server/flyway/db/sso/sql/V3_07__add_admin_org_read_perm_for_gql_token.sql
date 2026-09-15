
-- add perms: admin:org:read
update	sso_token 
set 	"json" = '{
	"rights": [
		"asset:uri", "job:create", "job:read", "job:update", "job:delete", "task:read", "task:update", "task:create", "task_type:internal", 
		"recording:create", "recording:read", "recording:update", "recording:delete", "report:create", "analytics:usage", 
		"ami-node:create", "developer:build:create", "developer:build:read", 
		"developer.build.deploy", "developer.build.update", "developer:build.upload", "developer:engine:read", "developer:engine:delete", 
		"developer:engine.update", "developer:build.invalidate", "cms:access", "discovery:access", "devops:querymonitor", "cluster:manager",
		"build:read", "build:create", "build:invalidate", "build:upload", "build:update", "admin:org:read"
	], 
	"tokenId": "graphql_test:3d11062eab179dad954305df5e424c5aef87d804ea83876f9e600d7c27d4eb56d6d57a67bb817588", 
	"internal": true, 
	"isRevoked": false, 
	"approverId": "f94d1303-6abd-49a5-9d98-fb93fb22d063", 
	"tokenLabel": "jenkins build pipeline", 
	"requestorId": "f94d1303-6abd-49a5-9d98-fb93fb22d063", 
	"createdDateTime": "2018-08-01T20:19:08Z", 
	"approvedDateTime": "2018-08-01T20:20:06Z", 
	"modifiedDateTime": "2019-08-07T20:20:06Z"
}'
where 	token_id = 'graphql_test:3d11062eab179dad954305df5e424c5aef87d804ea83876f9e600d7c27d4eb56d6d57a67bb817588';