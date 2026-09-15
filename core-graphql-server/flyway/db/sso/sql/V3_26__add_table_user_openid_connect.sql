DO $$
BEGIN
	create table if not exists public.sso_user__openid_connect (
		user_id uuid not null,
		connect_id uuid not null,
		connect_user_id text not null,
		connect_type text,
		kvp json,
		date_created timestamp without time zone DEFAULT now() NOT NULL
	);
	
	if not exists (select 1 from pg_constraint where conname = '_fk_sso_user__openid_connect@user_id') then 
		alter table public.sso_user__openid_connect add constraint "_fk_sso_user__openid_connect@user_id"
			foreign key (user_id)
			references public.sso_user (user_id);
	end if;

	if not exists (select 1 from pg_constraint where conname = '_fk_sso_user__openid_connect@connect_id') then 
		alter table public.sso_user__openid_connect add constraint "_fk_sso_user__openid_connect@connect_id"
			foreign key (connect_id)
			references public.sso_openid_connect (connect_id);
	end if;

	comment on column public.sso_user__openid_connect.connect_user_id is 'The identifier/id from the OpenID Providers';
	comment on column public.sso_user__openid_connect.connect_type is 'The OpenId Provider type, .e.g..google, azure-ad, github,..';
	comment on column public.sso_user__openid_connect.kvp is 'Key value pairs values which was synced from Providers.';
	
	alter table public.sso_user__openid_connect owner to postgres;

	alter table public.sso_openid_connect rename column organization_guid TO owner_organization_guid;

	create table if not exists public.sso_openid_connect__organization (
		connect_id uuid not null,
		organization_guid uuid not null,
		enabled bool default true 
	);
	
	alter table public.sso_openid_connect__organization owner to postgres;
END;
$$;