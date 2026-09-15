DROP TABLE IF EXISTS public.sso_scim_group CASCADE;
CREATE TABLE IF NOT EXISTS public.sso_scim_group
(
    group_id                UUID NOT NULL DEFAULT uuid_generate_v4(),
    group_name              TEXT NOT NULL,
    connect_id              UUID NOT NULL,
    group_external_id       TEXT,
    date_created            TIMESTAMPTZ(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    date_modified           TIMESTAMPTZ(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    PRIMARY KEY (group_id),
    CONSTRAINT unique_scim_group_name
        UNIQUE (group_name, connect_id)
);
ALTER TABLE public.sso_scim_group
    OWNER TO postgres;
GRANT SELECT ON TABLE public.sso_scim_group TO readaccess;

DROP TABLE IF EXISTS public.sso_scim_user_group CASCADE;
CREATE TABLE IF NOT EXISTS public.sso_scim_user_group
(
    group_id                UUID NOT NULL,
    connect_user_id         TEXT NOT NULL,
    date_created            TIMESTAMPTZ(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    date_modified           TIMESTAMPTZ(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    PRIMARY KEY (group_id, connect_user_id),
    CONSTRAINT fk_scim_group_id
        FOREIGN KEY (group_id) 
        REFERENCES public.sso_scim_group (group_id)
        ON DELETE CASCADE
);
ALTER TABLE public.sso_scim_user_group
    OWNER TO postgres;
GRANT SELECT ON TABLE public.sso_scim_user_group TO readaccess;