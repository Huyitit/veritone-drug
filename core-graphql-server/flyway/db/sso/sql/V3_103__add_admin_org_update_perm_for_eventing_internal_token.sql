UPDATE public.sso_token
SET "json"='{
    "rights": ["asset:uri", "master", "recording:read", "recording:update", "asset:all", "task:read",
        "task:update", "job:read", "job:create", "task_type:internal", "cms:sources:read",
        "cms:sources:update", "admin.org:read", "admin.group:read", "developer:build:read",
        "devops:querymonitor", "admin:org:update"],
    "internal": true,
    "isRevoked": false,
    "tokenId": "core-eventing-service:0341b51370274e3c97a69bc60e57cfe3e8722dcf465c4876affc4e2d09c564ec",
    "tokenLabel": "core-eventing-service"
}'
WHERE token_id='core-eventing-service:0341b51370274e3c97a69bc60e57cfe3e8722dcf465c4876affc4e2d09c564ec';
