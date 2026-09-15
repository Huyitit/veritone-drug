DO $FLYWAY$
BEGIN

-- This script will ensure all tokens are assigned with user_id
-- 1. use json field to find organization/application_id id
	UPDATE public.sso_token SET
		application_id = (SELECT application_id FROM public.sso_application WHERE application_id = (json ->> 'applicationId')::UUID)
	WHERE 
    application_id IS NULL AND 
		json ->> 'applicationId' IS NOT NULL;

-- 2. get group_id using application_id
	UPDATE public.sso_token t SET
		group_id = g.group_id
	FROM public.sso_group g 
	WHERE
    t.application_id = g.application_id AND
		t.group_id IS NULL AND 
		t.application_id IS NOT NULL;

END;
$FLYWAY$