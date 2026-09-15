-- add permmisions for VDH build tester: "developer:access"
update	sso_token 
set 	"json" = '{
		"rights":[
			"engine:read",
			"build:read",
			"build:create",
			"build:invalidate",
			"build:upload",
			"build:approve",
			"build:submit",
			"build:deploy",
			"asset:uri",
			"recording:read",
			"recording:update",
			"task:update",
			"job:create",
			"organization:read",
			"developer.engine.create",
			"developer.build.deploy",
			"developer:build:read",
			"developer:build:create",
			"developer:build:update",
			"developer:build:upload",
			"developer:build:invalidate",
			"developer:build:approve",
			"developer:build:submit",
			"developer:access"
		],
		"internal":true,
		"token_id":"vdh-docker-prod:8dd6c48866e7eb473b2c7849348863d0a8038bd7eed7a1d9f79af8cf491c8071",
		"isRevoked":false,
		"tokenLabel":"vdh-docker-prod"
	}'
where token_id = 'vdh-docker-prod:8dd6c48866e7eb473b2c7849348863d0a8038bd7eed7a1d9f79af8cf491c8071';
