CREATE TABLE IF NOT EXISTS public.sso_openid_connect (
  connect_id UUID DEFAULT public.uuid_generate_v4() PRIMARY KEY NOT NULL,
  organization_guid uuid,
  name text NOT NULL,
  description text,
  website_url text DEFAULT ''::text,
  credentials_ciphertext text,
  login_button_style json,
  is_global boolean DEFAULT false,
  use_notice text,
  openid_type text DEFAULT 'passport'::text,
  date_created timestamp without time zone DEFAULT now() NOT NULL,
  date_modified timestamp without time zone
);

CREATE INDEX IF NOT EXISTS "_ix_sso_openid_connect@organization_guid" ON public.sso_openid_connect USING btree (organization_guid);

ALTER TABLE public.sso_openid_connect OWNER TO postgres;