-- reset the primary key for sso_user_role to (user_id, role_id)
ALTER TABLE ONLY public.sso_user_role DROP CONSTRAINT IF EXISTS "_pk_sso_user_role@user_id,role_id";
ALTER TABLE ONLY public.sso_user_role DROP CONSTRAINT IF EXISTS "_pk_sso_user_role@user_id,role_id,application_id";

ALTER TABLE ONLY public.sso_user_role ADD CONSTRAINT "_pk_sso_user_role@user_id,role_id" PRIMARY KEY (user_id, role_id);
ALTER TABLE public.sso_user_role ALTER COLUMN application_id DROP NOT NULL;
