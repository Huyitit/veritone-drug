CREATE TABLE IF NOT EXISTS public.sso_user__scim_connect_id (
    row_id uuid NOT NULL DEFAULT uuid_generate_v4 (),
    user_id uuid NOT NULL,
    scim_connect_id uuid NOT NULL,
    PRIMARY KEY (row_id),
    FOREIGN KEY (user_id) REFERENCES public.sso_user(user_id) ON DELETE CASCADE,
    UNIQUE (user_id, scim_connect_id)
);

INSERT INTO public.sso_user__scim_connect_id (user_id, scim_connect_id)
  SELECT user_id, substring(scim_connect_id, 6)::uuid
  FROM public.sso_user
  WHERE scim_connect_id NOTNULL AND status != 'deleted'
  ON CONFLICT(user_id, scim_connect_id) DO NOTHING;

ALTER TABLE public.sso_user__scim_connect_id OWNER to postgres;
