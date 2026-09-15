DO $$
BEGIN
    UPDATE public.sso_token 
    SET "json" = ' {
        "rights": [
            "asset:uri", "master", "recording:read", "recording:update", "asset:all", "task:update", "job:read", "job:create",
            "task_type:internal", "cms:sources:read", "cms:sources:update", "admin.org:read", "admin.group:read", "task:read",
            "admin:org:update",
            "superadmin",
            "admin.org.create",
            "developer.engine.read",
            "developer.engine.update"
        ],
        "internal": false,
        "isRevoked": false,
        "tokenId": "automate-service-user:1e7ab9df41664631a3c2abd23131aa938750c79c75444b60ae846f0c0e9f2f17",
        "tokenLabel": "automate-service-user"
        }'
    WHERE user_id = '55DD894A-06EB-455F-BD41-CCEA4C3021DC' AND token_id = 'automate-service-user:1e7ab9df41664631a3c2abd23131aa938750c79c75444b60ae846f0c0e9f2f17';
END;
$$