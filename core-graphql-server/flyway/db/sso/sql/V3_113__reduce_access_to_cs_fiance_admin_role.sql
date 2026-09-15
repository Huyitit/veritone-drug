-- This updates user-role from Customer Service, Finance Admin to Admin
-- If the users are not in the root org

DO $$
DECLARE root_org_group_id UUID;
BEGIN
   -- Get the sso group for the root org
   root_org_group_id = (SELECT group_id FROM sso_group WHERE kvp->>'organizationId' = '@@{ROOT_ORG_ID}@@' LIMIT 1);
   IF root_org_group_id IS NOT NULL THEN

      -- Delete the user-role if the users have another record in user-role table for the Admin role
      DELETE FROM sso_user_role sur
      USING 
         (
            SELECT DISTINCT sur.user_id, sur.role_id, sur.application_id 
            FROM sso_user_role sur
                  INNER JOIN sso_user__sso_group susg on sur.user_id = susg.user_id
                  INNER JOIN sso_group sg on susg.group_id = sg.group_id AND sur.application_id = sg.application_id
            WHERE 
                  sg.group_id <> root_org_group_id
                  AND sur.role_id IN (
                     '3459c3de-493f-443a-8ad0-ddb9f3f6c76d', -- Customer Service
                     '37b18322-74bf-4ae4-a46f-2cc407a9966c'	-- Finance Admin
                  )
                  AND EXISTS (
                     SELECT user_id FROM sso_user_role
                     WHERE user_id=sur.user_id
                        AND role_id='ddca9b68-d775-4934-8ffd-7aecc779b652' -- Admin ROLE
                        AND application_id=sur.application_id
                        LIMIT 1
                  )
         ) AS user_roles
      WHERE sur.user_id=user_roles.user_id 
         AND sur.role_id=user_roles.role_id
         AND sur.application_id=user_roles.application_id;

      -- Update the current role to the Admin role
      UPDATE sso_user_role
      SET role_id = 'ddca9b68-d775-4934-8ffd-7aecc779b652' -- Admin ROLE
      FROM
         (
            SELECT DISTINCT sur.user_id, sur.role_id, sur.application_id 
            FROM sso_user_role sur
                  INNER JOIN sso_user__sso_group susg on sur.user_id = susg.user_id
                  INNER JOIN sso_group sg on susg.group_id = sg.group_id AND sur.application_id = sg.application_id
            WHERE 
                  sg.group_id <> root_org_group_id
                  AND sur.role_id IN (
                     '3459c3de-493f-443a-8ad0-ddb9f3f6c76d', -- Customer Service
                     '37b18322-74bf-4ae4-a46f-2cc407a9966c'	-- Finance Admin
                  )
         ) AS user_roles

      WHERE sso_user_role.user_id=user_roles.user_id 
         AND sso_user_role.role_id=user_roles.role_id
         AND sso_user_role.application_id=user_roles.application_id
      ;
   ELSE
      -- Fail the flyway script if conditions are not met
      RAISE EXCEPTION 'The root org or associated group to the root org is NULL. root_org_group_id %', root_org_group_id;
   END IF;
END;
$$