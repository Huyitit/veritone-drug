DO $$
BEGIN
	ALTER TABLE public.sso_user__openid_connect ADD COLUMN IF NOT EXISTS identifier_id TEXT;
	ALTER TABLE public.sso_user__openid_connect ADD COLUMN IF NOT EXISTS date_modified TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL;

	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_pk_sso_user__openid_connect@user_id,connect_id') THEN
		ALTER TABLE ONLY public.sso_user__openid_connect
    		ADD CONSTRAINT "_pk_sso_user__openid_connect@user_id,connect_id" PRIMARY KEY (user_id, connect_id);
	END IF;

	GRANT SELECT ON TABLE public.sso_openid_connect to readaccess;
	GRANT SELECT ON TABLE public.sso_user__openid_connect to readaccess;
	GRANT SELECT ON TABLE public.sso_openid_connect__organization to readaccess;
END;
$$;
