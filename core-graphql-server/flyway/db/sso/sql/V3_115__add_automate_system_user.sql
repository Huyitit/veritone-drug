DO $$
DECLARE root_org_guid UUID;
DECLARE root_org_group_id UUID;
DECLARE new_automate_user_id UUID := '55DD894A-06EB-455F-BD41-CCEA4C3021DC';
DECLARE automate_user_email TEXT :=  'automate-service-user@veritone.com';

BEGIN
   -- Get the root org guid
   root_org_guid = (SELECT application_id FROM sso_group WHERE kvp->>'organizationId' = '@@{ROOT_ORG_ID}@@' LIMIT 1);
   root_org_group_id = (SELECT group_id FROM sso_group WHERE kvp->>'organizationId' = '@@{ROOT_ORG_ID}@@' LIMIT 1);
   IF root_org_guid IS NOT NULL AND root_org_group_id IS NOT NULL THEN
      -- Create the Automate Service User
      INSERT INTO
         sso_user(
            user_id,
            user_name,
            password,
            password_change_required,
            kvp,
            email,
            status,
            "system_user",
            date_modified,
            modified_by
         )
      VALUES
      (
            -- New User Id
            new_automate_user_id,
            -- Username
            automate_user_email,
            -- Password Hash
            '$2b$12$xNPhUVDg0PMK991tlhGT/uFciQczZ4wRHumnRoTqN6fU.qcteeTb.',
            -- Require Password Change,
            false,
            -- kvp
            '{"firstName":"Automate","lastName":"Service"}',
            -- Email
            automate_user_email,
            -- Status
            'active',
            -- Is System User
            true,
            -- Date Modified
            NOW(),
            -- Modified By User Id
            '00000000-0000-0000-0000-000000000000'
         ) ON CONFLICT DO NOTHING;

      -- Add the Automate System User to the Customer Service role (superadmin permission)
      INSERT INTO
         sso_user_role(
            user_id,
            role_id,
            date_created,
            created_by,
            application_id
         )
         VALUES(
            -- New Automate User Id
            new_automate_user_id,
            -- Role (superadmin permission)
            '3459c3de-493f-443a-8ad0-ddb9f3f6c76d',
            -- Date Created
            NOW(),
            -- Created By User Id
            '00000000-0000-0000-0000-000000000000',
            -- Root Org (application_id)
            root_org_guid
         ) ON CONFLICT DO NOTHING;

      -- Add the Automate Service User to the group associated with the root org
      INSERT INTO
         sso_user__sso_group(
            user_id,
            group_id,
            priority
         )
         VALUES
         (
            -- New Automate Service User Id
            new_automate_user_id,
            -- Group Id
            root_org_group_id,
            -- Priority
            0
         ) ON CONFLICT DO NOTHING;
   ELSE
      -- Fail the flyway script if conditions are not met
      RAISE EXCEPTION 'The root org or associated group to the root org is NULL. root_org_guid: %, root_org_group_id %', root_org_guid, root_org_group_id;
   END IF;

    INSERT INTO	public.sso_token (user_id, token_id, json) VALUES (
         new_automate_user_id,
        'automate-service-user:1e7ab9df41664631a3c2abd23131aa938750c79c75444b60ae846f0c0e9f2f17',
        ' {
	"rights": [
		"asset:uri", "master", "recording:read", "recording:update", "asset:all", "task:update", "job:read", "job:create",
		"task_type:internal", "cms:sources:read", "cms:sources:update", "admin.org:read", "admin.group:read", "task:read",
		"admin:org:update",
        "superadmin",
        "admin.org.create",
        "developer.engine.read"
	],
	"internal": false,
	"isRevoked": false,
	"tokenId": "automate-service-user:1e7ab9df41664631a3c2abd23131aa938750c79c75444b60ae846f0c0e9f2f17",
	"tokenLabel": "automate-service-user"
    }'
    ) ON CONFLICT DO NOTHING;

END;
$$
