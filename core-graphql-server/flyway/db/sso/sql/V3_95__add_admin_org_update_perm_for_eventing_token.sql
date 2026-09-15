-- add perms: "admin.org.update"
UPDATE public.sso_token
SET "json"='{
	"rights": [
		"asset:uri", "master", "recording:read", "recording:update", "asset:all", "task:update", "job:read", "job:create",
		"task_type:internal", "cms:sources:read", "cms:sources:update", "admin.org:read", "admin.group:read", "task:read",
		"admin:org:update"
	],
	"internal": true,
	"isRevoked": false,
	"tokenId": "task-insert-into-index-v7:a2817dfc62934cdeb60ee40f66d50b2c33d3a51822544bcfb88c19a76771eda1",
	"tokenLabel": "task-insert-server-es7"
}'::json
WHERE token_id='task-insert-into-index-v7:a2817dfc62934cdeb60ee40f66d50b2c33d3a51822544bcfb88c19a76771eda1';
