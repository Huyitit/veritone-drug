DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_pk_sso_openid_connect__organization@connect_id,organization_guid') THEN 
		ALTER TABLE ONLY public.sso_openid_connect__organization
    		ADD CONSTRAINT "_pk_sso_openid_connect__organization@connect_id,organization_guid" PRIMARY KEY (connect_id, organization_guid);
	END IF;
END;
$$;