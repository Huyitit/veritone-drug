DO $$
DECLARE
	users_to_delete TEXT[] := ARRAY['dev+superadmin@veritone.com', 'hji+superadmin@veritone.com', 'sys_graphql_citest_superadmin@veritone.com']:: TEXT[];
	user_ids_to_delete UUID[];
BEGIN
	user_ids_to_delete = ARRAY(SELECT user_id FROM public.sso_user WHERE user_name = ANY(users_to_delete))::UUID[];

  IF '@@{ENVIRONMENT}@@' = 'ON_PREM' THEN
    -- Delete unwanted users in relation tables
    DELETE FROM public.sso_user__openid_connect WHERE user_id = ANY(user_ids_to_delete);
    DELETE FROM public.user_history WHERE user_id = ANY(user_ids_to_delete);
    DELETE FROM public.sso_user_role WHERE user_id = ANY(user_ids_to_delete);
    DELETE FROM public.sso_user__sso_group WHERE user_id = ANY(user_ids_to_delete);
    -- Delete unwanted users in sso_user table
    DELETE FROM  public.sso_user WHERE user_id = ANY(user_ids_to_delete);
  END IF;
END;
$$;