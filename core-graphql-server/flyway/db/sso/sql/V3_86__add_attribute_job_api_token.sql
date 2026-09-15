INSERT INTO public.sso_token
    ("token_id", "application_id", "group_id", "json")
VALUES (
    'attribute-job:3dfdbdcb7ee14920bf5f9f4fdd28676a30470ebf2b144b04b31e737dbddd27bc',
    NULL,
    NULL,
    '{
        "tokenLabel":"Start Attribute Job API Key",
        "isRevoked":false,
        "rights":[
            "job:create",
            "admin:org:read",
            "admin:user:read",
            "admin:user:create",
            "admin:user:delete",
            "recording:read"
        ],
        "internal":true,
        "tokenId":"attribute-job:3dfdbdcb7ee14920bf5f9f4fdd28676a30470ebf2b144b04b31e737dbddd27bc"
    }'
)
ON CONFLICT (token_id) DO UPDATE SET "json" = EXCLUDED."json";