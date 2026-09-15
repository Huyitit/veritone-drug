DO $$
DECLARE root_org_guid UUID;
DECLARE root_org_group_id UUID;
BEGIN
   -- Get the root org guid
   root_org_guid = (SELECT application_id FROM sso_group WHERE kvp->>'organizationId' = '@@{ROOT_ORG_ID}@@' LIMIT 1);
   root_org_group_id = (SELECT group_id FROM sso_group WHERE kvp->>'organizationId' = '@@{ROOT_ORG_ID}@@' LIMIT 1);
   IF root_org_guid IS NOT NULL AND root_org_group_id IS NOT NULL THEN
      -- Create the Universal Hub User
      INSERT INTO
         sso_user(
            user_id,
            user_name,
            password,
            password_change_required,
            kvp,
            email,
            status,
            date_modified,
            modified_by
         )
      VALUES
      (
            -- New Hub User Id
            '7b2a935e-6c68-4c59-b54d-d502f0b63d7d',
            -- Username
            'hub-service@veritone.com',
            -- Password Hash
            '$2b$12$xNPhUVDg0PMK991tlhGT/uFciQczZ4wRHumnRoTqN6fU.qcteeTb.',
            -- Require Password Change,
            true,
            -- kvp
            '{"firstName":"Hub","lastName":"Service"}',
            -- Email
            'hub-service@veritone.com',
            -- Status
            'active',
            -- Date Modified
            NOW(),
            -- Modified By User Id
            '00000000-0000-0000-0000-000000000000'
         ) ON CONFLICT DO NOTHING;

      -- Add the Hub User to the Customer Service role (superadmin permission)
      INSERT INTO
         sso_user_role(
            user_id,
            role_id,
            date_created,
            created_by,
            application_id
         )
         VALUES(
            -- New Hub User Id
            '7b2a935e-6c68-4c59-b54d-d502f0b63d7d',
            -- Customer Service Role (superadmin permission)
            '3459c3de-493f-443a-8ad0-ddb9f3f6c76d',
            -- Date Created
            NOW(),
            -- Created By User Id
            '00000000-0000-0000-0000-000000000000',
            -- Root Org (application_id)
            root_org_guid
         ) ON CONFLICT DO NOTHING;

      -- Add the Hub User to the group associated with the root org
      INSERT INTO
         sso_user__sso_group(
            user_id,
            group_id,
            priority
         )
         VALUES
         (
            -- New Hub User Id
            '7b2a935e-6c68-4c59-b54d-d502f0b63d7d',
            -- Group Id
            root_org_group_id,
            -- Priority
            0
         ) ON CONFLICT DO NOTHING;
   ELSE
      -- Fail the flyway script if conditions are not met
      RAISE EXCEPTION 'The root org or associated group to the root org is NULL. root_org_guid: %, root_org_group_id %', root_org_guid, root_org_group_id;
   END IF;
END;
$$