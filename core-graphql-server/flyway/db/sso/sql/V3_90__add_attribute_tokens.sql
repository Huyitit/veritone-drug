INSERT INTO public.sso_token
    ("token_id", "application_id", "group_id", "json")
VALUES (
    'correlation:LZQB8bsI5d73gJKYKO74pYmqct2UIeKodNkMygqDETerg95CGCHvj7lbtAymMAe0',
    NULL,
    NULL,
    '{
        "tokenLabel":"Attribute correlation",
        "isRevoked":false,
        "rights":[
           "asset:uri",
            "master",
            "recording:read",
            "recording:update",
            "asset:all",
            "task:update",
            "job:read",
            "job:create",
            "task_type:internal",
            "cms:sources:read",
            "cms:sources:update",
            "admin.org:read",
            "admin.group:read"
        ],
        "internal":true,
        "tokenId":"correlation:LZQB8bsI5d73gJKYKO74pYmqct2UIeKodNkMygqDETerg95CGCHvj7lbtAymMAe0"
    }'
)
ON CONFLICT (token_id) DO UPDATE SET "json" = EXCLUDED."json";
