-- CREATE ROLE postgres;
-- CREATE ROLE readaccess;

CREATE OR REPLACE FUNCTION public.trigger_set_timestamp_date_modified() RETURNS TRIGGER
    LANGUAGE plpgsql
AS
$$
BEGIN
    new.date_modified = NOW();
    RETURN new;
END;
$$;
ALTER FUNCTION public.trigger_set_timestamp_date_modified() OWNER TO postgres;

-- Remove the older
DROP TABLE IF EXISTS public.rbac_auth_group_member;
DROP TABLE IF EXISTS public.rbac_folder_role;
DROP TABLE IF EXISTS public.rbac_organization_role;
DROP TABLE IF EXISTS public.rbac_recording_role;
DROP TABLE IF EXISTS public.rbac_role;
DROP TABLE IF EXISTS public.rbac_auth_group;

-- OLP --
DROP TYPE IF EXISTS TYPE_RBAC_AUTH_GROUP_SOURCE CASCADE;
CREATE TYPE public.TYPE_RBAC_AUTH_GROUP_SOURCE AS ENUM ('API', 'Integration', 'App Role');
COMMENT ON TYPE public.TYPE_RBAC_AUTH_GROUP_SOURCE IS 'Source is what created the object.';
ALTER TYPE public.TYPE_RBAC_AUTH_GROUP_SOURCE OWNER TO postgres;

DROP TABLE IF EXISTS public.rbac_auth_group CASCADE;
CREATE TABLE IF NOT EXISTS public.rbac_auth_group
(
    auth_group_id          UUID                        NOT NULL
        CONSTRAINT "_pk_sso_rbac_auth_group@auth_group_id"
            PRIMARY KEY,

    auth_group_name        VARCHAR(100)                NOT NULL,
    auth_group_description TEXT,
    organization_guid      UUID                        NOT NULL,
    kvp                    JSON,
    is_system              BOOL                        NOT NULL DEFAULT FALSE,

    source                 TYPE_RBAC_AUTH_GROUP_SOURCE NOT NULL DEFAULT 'API'::TYPE_RBAC_AUTH_GROUP_SOURCE,
    role_id                UUID                        NULL,
    date_created           TIMESTAMP                            DEFAULT NOW() NOT NULL,
    date_modified          TIMESTAMP                            DEFAULT NOW() NOT NULL,
    created_by             UUID                        NOT NULL,
    modified_by            UUID                        NOT NULL,

    CONSTRAINT fk_created_by
        FOREIGN KEY (created_by)
            REFERENCES public.sso_user (user_id),
    CONSTRAINT fk_modified_by
        FOREIGN KEY (modified_by)
            REFERENCES public.sso_user (user_id),
    CONSTRAINT fk_role_id
        FOREIGN KEY (role_id)
            REFERENCES public.role (role_id),
    CONSTRAINT _un_name_org UNIQUE (organization_guid, auth_group_name)
);

COMMENT ON TABLE public.rbac_auth_group IS 'Table that manages groups in aiware';
COMMENT ON COLUMN rbac_auth_group.kvp IS 'JSON property bag for group object - DO NOT USE without good reason';
COMMENT ON COLUMN rbac_auth_group.organization_guid IS 'Organization this group belongs to';
COMMENT ON COLUMN rbac_auth_group.is_system IS 'If is system, unable to delete via API or User';
COMMENT ON COLUMN rbac_auth_group.source IS 'Source of the group';
COMMENT ON COLUMN rbac_auth_group.role_id IS 'If the source is approle, then role_id must be set';

DROP TRIGGER IF EXISTS tr_rbac_auth_group ON public.rbac_auth_group;

CREATE TRIGGER tr_rbac_auth_group
    BEFORE UPDATE
    ON public.rbac_auth_group
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

ALTER TABLE public.rbac_auth_group
    OWNER TO postgres;

CREATE INDEX IF NOT EXISTS "_ix_sso_rbac_auth_group@organization_guid"
    ON public.rbac_auth_group (organization_guid);

GRANT SELECT ON public.rbac_auth_group TO readaccess;

CREATE TABLE IF NOT EXISTS public.rbac_permission_set
(
    permission_set_name        VARCHAR(100)            NOT NULL,
    permission_set_description VARCHAR(500),
    permissions                BIT VARYING             NOT NULL,

    organization_guid          UUID                    NOT NULL,
    application_id             UUID                    NULL,
    role_id                    UUID                    NULL,

    date_created               TIMESTAMP DEFAULT NOW() NOT NULL,
    date_modified              TIMESTAMP DEFAULT NOW() NOT NULL,

    permission_set_id          UUID                    NOT NULL
        CONSTRAINT rbac_permission_set_id_pk
            PRIMARY KEY,

    created_by                 UUID                    NOT NULL,
    modified_by                UUID                    NOT NULL,

    CONSTRAINT fk_created_by
        FOREIGN KEY (created_by)
            REFERENCES public.sso_user (user_id),
    CONSTRAINT fk_modified_by
        FOREIGN KEY (modified_by)
            REFERENCES public.sso_user (user_id),
    CONSTRAINT fk_role_id
        FOREIGN KEY (role_id)
            REFERENCES public.role (role_id)
);

COMMENT ON TABLE public.rbac_permission_set IS 'Table that manages roles, permission sets, in aiware';
COMMENT ON COLUMN rbac_permission_set.organization_guid IS 'Organization this role belongs to. This is always set.  For app roles, this is set to the owner org of app.';
COMMENT ON COLUMN rbac_permission_set.application_id IS 'Application this role belongs to.  This may be null.';
COMMENT ON COLUMN rbac_permission_set.permission_set_id IS 'Primary key for table';

DROP TRIGGER IF EXISTS tr_rbac_permission_set ON public.rbac_permission_set;
CREATE TRIGGER tr_rbac_permission_set
    BEFORE UPDATE
    ON public.rbac_permission_set
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

ALTER TABLE public.rbac_permission_set
    OWNER TO postgres;

CREATE INDEX IF NOT EXISTS rbac_role_role_name_idx
    ON public.rbac_permission_set (permission_set_name);

GRANT SELECT ON public.rbac_permission_set TO readaccess;

DROP TYPE IF EXISTS RBAC_MEMBER_TYPE CASCADE;
CREATE TYPE public.RBAC_MEMBER_TYPE AS ENUM ('user', 'group');
COMMENT ON TYPE public.RBAC_MEMBER_TYPE IS 'Describes the type of member - user or group.  Group is default.';
ALTER TYPE public.RBAC_MEMBER_TYPE OWNER TO postgres;

DROP TABLE IF EXISTS rbac_auth_group_member CASCADE;
CREATE TABLE IF NOT EXISTS public.rbac_auth_group_member
(
    auth_group_id UUID                    NOT NULL
        CONSTRAINT rbac_auth_group_member_fk
            REFERENCES public.rbac_auth_group,

    member_id     UUID                    NOT NULL,
    member_type   RBAC_MEMBER_TYPE        NOT NULL DEFAULT 'user',

    date_created  TIMESTAMP DEFAULT NOW() NOT NULL,
    date_modified TIMESTAMP DEFAULT NOW() NOT NULL,

    CONSTRAINT rbac_auth_group_member_pk
        PRIMARY KEY (auth_group_id, member_id)
) PARTITION BY HASH (auth_group_id);


COMMENT ON TABLE public.rbac_auth_group_member IS 'Table that manages users or groups in a group';
COMMENT ON COLUMN rbac_auth_group_member.auth_group_id IS 'Group ID';
COMMENT ON COLUMN rbac_auth_group_member.member_type IS 'Type of member - either user or group';

CREATE TABLE rbac_auth_group_member_h20_p0 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 0);
CREATE TABLE rbac_auth_group_member_h20_p1 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 1);
CREATE TABLE rbac_auth_group_member_h20_p2 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 2);
CREATE TABLE rbac_auth_group_member_h20_p3 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 3);
CREATE TABLE rbac_auth_group_member_h20_p4 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 4);
CREATE TABLE rbac_auth_group_member_h20_p5 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 5);
CREATE TABLE rbac_auth_group_member_h20_p6 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 6);
CREATE TABLE rbac_auth_group_member_h20_p7 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 7);
CREATE TABLE rbac_auth_group_member_h20_p8 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 8);
CREATE TABLE rbac_auth_group_member_h20_p9 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 9);
CREATE TABLE rbac_auth_group_member_h20_p10 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 10);
CREATE TABLE rbac_auth_group_member_h20_p11 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 11);
CREATE TABLE rbac_auth_group_member_h20_p12 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 12);
CREATE TABLE rbac_auth_group_member_h20_p13 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 13);
CREATE TABLE rbac_auth_group_member_h20_p14 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 14);
CREATE TABLE rbac_auth_group_member_h20_p15 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 15);
CREATE TABLE rbac_auth_group_member_h20_p16 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 16);
CREATE TABLE rbac_auth_group_member_h20_p17 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 17);
CREATE TABLE rbac_auth_group_member_h20_p18 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 18);
CREATE TABLE rbac_auth_group_member_h20_p19 PARTITION OF rbac_auth_group_member FOR VALUES WITH (MODULUS 20, REMAINDER 19);

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p0 ON public.rbac_auth_group_member_h20_p0;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p0
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p0
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p1 ON public.rbac_auth_group_member_h20_p1;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p1
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p1
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p2 ON public.rbac_auth_group_member_h20_p2;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p2
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p2
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p3 ON public.rbac_auth_group_member_h20_p3;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p3
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p3
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p4 ON public.rbac_auth_group_member_h20_p4;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p4
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p4
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p5 ON public.rbac_auth_group_member_h20_p5;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p5
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p5
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p6 ON public.rbac_auth_group_member_h20_p6;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p6
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p6
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p7 ON public.rbac_auth_group_member_h20_p7;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p7
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p7
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p8 ON public.rbac_auth_group_member_h20_p8;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p8
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p8
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p9 ON public.rbac_auth_group_member_h20_p9;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p9
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p9
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p10 ON public.rbac_auth_group_member_h20_p10;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p10
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p10
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p11 ON public.rbac_auth_group_member_h20_p11;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p11
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p11
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p12 ON public.rbac_auth_group_member_h20_p12;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p12
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p12
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p13 ON public.rbac_auth_group_member_h20_p13;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p13
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p13
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p14 ON public.rbac_auth_group_member_h20_p14;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p14
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p14
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p15 ON public.rbac_auth_group_member_h20_p15;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p15
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p15
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p16 ON public.rbac_auth_group_member_h20_p16;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p16
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p16
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p17 ON public.rbac_auth_group_member_h20_p17;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p17
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p17
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p18 ON public.rbac_auth_group_member_h20_p18;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p18
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p18
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_auth_group_member_h20_p19 ON public.rbac_auth_group_member_h20_p19;
CREATE TRIGGER tr_rbac_auth_group_member_h20_p19
    BEFORE UPDATE
    ON public.rbac_auth_group_member_h20_p19
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

ALTER TABLE public.rbac_auth_group_member OWNER TO postgres;

ALTER TABLE public.rbac_auth_group_member_h20_p0 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p1 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p2 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p3 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p4 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p5 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p6 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p7 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p8 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p9 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p10 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p11 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p12 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p13 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p14 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p15 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p16 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p17 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p18 OWNER TO postgres;
ALTER TABLE public.rbac_auth_group_member_h20_p19 OWNER TO postgres;

CREATE INDEX IF NOT EXISTS rbac_auth_group_member_member_id_idx
    ON public.rbac_auth_group_member (member_id);

GRANT SELECT ON public.rbac_auth_group_member TO readaccess;

-- ACE for Recording
DROP TYPE IF EXISTS RBAC_OBJECT_TYPE CASCADE;
CREATE TYPE public.RBAC_OBJECT_TYPE AS ENUM ('recording', 'folder', 'organization', 'application', 'structured_data', 'engine', 'library', 'dataset');
COMMENT ON TYPE public.RBAC_OBJECT_TYPE IS 'Describes the type of object that is secured.';
ALTER TYPE public.RBAC_OBJECT_TYPE OWNER TO postgres;

-- TODO: Do we need partitioning on this?
DROP TABLE IF EXISTS rbac_acl CASCADE;
CREATE TABLE IF NOT EXISTS public.rbac_acl
(
    object_type       RBAC_OBJECT_TYPE NOT NULL DEFAULT 'recording',
    id_text           TEXT             NOT NULL DEFAULT '',

    auth_group_id     UUID             NOT NULL
        CONSTRAINT rbac_recording_role_fk
            REFERENCES public.rbac_auth_group,
    permission_set_id UUID             NOT NULL
        CONSTRAINT rbac_permission_set_fk_1
            REFERENCES public.rbac_permission_set (permission_set_id),

    protected         BOOL             NOT NULL DEFAULT FALSE,
    organization_id   INTEGER          NOT NULL DEFAULT -1,

    date_created      TIMESTAMP                 DEFAULT NOW() NOT NULL,
    date_modified     TIMESTAMP                 DEFAULT NOW() NOT NULL,

    created_by        UUID             NOT NULL,
    modified_by       UUID             NOT NULL,

    CONSTRAINT fk_created_by
        FOREIGN KEY (created_by)
            REFERENCES public.sso_user (user_id),
    CONSTRAINT fk_modified_by
        FOREIGN KEY (modified_by)
            REFERENCES public.sso_user (user_id),
    CONSTRAINT rbac_recording_role_pk
        PRIMARY KEY (organization_id, object_type, id_text, auth_group_id, permission_set_id)
) PARTITION BY HASH (organization_id);

COMMENT ON TABLE public.rbac_acl IS 'Holds the ACEs for objects';
COMMENT ON COLUMN rbac_acl.auth_group_id IS 'Group ID - This is the group that will get the permissions by role_id';
COMMENT ON COLUMN rbac_acl.object_type IS 'Enum for object type.  RBAC_OBJECT_TYPE';
COMMENT ON COLUMN rbac_acl.id_text IS 'ID for object';
COMMENT ON COLUMN rbac_acl.permission_set_id IS 'Role ID - This is the role id';
COMMENT ON COLUMN rbac_acl.protected IS 'If protected, unable to delete via API or User except via Org Admin';
COMMENT ON COLUMN rbac_acl.organization_id IS 'Organization ID this ACL applies to. OrgID is internal';
CREATE TABLE public.rbac_acl_h20_p0 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 0);
CREATE TABLE public.rbac_acl_h20_p1 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 1);
CREATE TABLE public.rbac_acl_h20_p2 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 2);
CREATE TABLE public.rbac_acl_h20_p3 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 3);
CREATE TABLE public.rbac_acl_h20_p4 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 4);
CREATE TABLE public.rbac_acl_h20_p5 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 5);
CREATE TABLE public.rbac_acl_h20_p6 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 6);
CREATE TABLE public.rbac_acl_h20_p7 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 7);
CREATE TABLE public.rbac_acl_h20_p8 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 8);
CREATE TABLE public.rbac_acl_h20_p9 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 9);
CREATE TABLE public.rbac_acl_h20_p10 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 10);
CREATE TABLE public.rbac_acl_h20_p11 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 11);
CREATE TABLE public.rbac_acl_h20_p12 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 12);
CREATE TABLE public.rbac_acl_h20_p13 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 13);
CREATE TABLE public.rbac_acl_h20_p14 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 14);
CREATE TABLE public.rbac_acl_h20_p15 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 15);
CREATE TABLE public.rbac_acl_h20_p16 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 16);
CREATE TABLE public.rbac_acl_h20_p17 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 17);
CREATE TABLE public.rbac_acl_h20_p18 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 18);
CREATE TABLE public.rbac_acl_h20_p19 PARTITION OF public.rbac_acl FOR VALUES WITH (MODULUS 20, REMAINDER 19);

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p1 ON public.rbac_acl_h20_p1;
CREATE TRIGGER tr_rbac_acl_h20_p1
    BEFORE UPDATE
    ON public.rbac_acl_h20_p1
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p2 ON public.rbac_acl_h20_p2;
CREATE TRIGGER tr_rbac_acl_h20_p2
    BEFORE UPDATE
    ON public.rbac_acl_h20_p2
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p3 ON public.rbac_acl_h20_p3;
CREATE TRIGGER tr_rbac_acl_h20_p3
    BEFORE UPDATE
    ON public.rbac_acl_h20_p3
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p4 ON public.rbac_acl_h20_p4;
CREATE TRIGGER tr_rbac_acl_h20_p4
    BEFORE UPDATE
    ON public.rbac_acl_h20_p4
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p5 ON public.rbac_acl_h20_p5;
CREATE TRIGGER tr_rbac_acl_h20_p5
    BEFORE UPDATE
    ON public.rbac_acl_h20_p5
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p6 ON public.rbac_acl_h20_p6;
CREATE TRIGGER tr_rbac_acl_h20_p6
    BEFORE UPDATE
    ON public.rbac_acl_h20_p6
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p7 ON public.rbac_acl_h20_p7;
CREATE TRIGGER tr_rbac_acl_h20_p7
    BEFORE UPDATE
    ON public.rbac_acl_h20_p7
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p8 ON public.rbac_acl_h20_p8;
CREATE TRIGGER tr_rbac_acl_h20_p8
    BEFORE UPDATE
    ON public.rbac_acl_h20_p8
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p9 ON public.rbac_acl_h20_p9;
CREATE TRIGGER tr_rbac_acl_h20_p9
    BEFORE UPDATE
    ON public.rbac_acl_h20_p9
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p10 ON public.rbac_acl_h20_p10;
CREATE TRIGGER tr_rbac_acl_h20_p10
    BEFORE UPDATE
    ON public.rbac_acl_h20_p10
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p11 ON public.rbac_acl_h20_p11;
CREATE TRIGGER tr_rbac_acl_h20_p11
    BEFORE UPDATE
    ON public.rbac_acl_h20_p11
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p12 ON public.rbac_acl_h20_p12;
CREATE TRIGGER tr_rbac_acl_h20_p12
    BEFORE UPDATE
    ON public.rbac_acl_h20_p12
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p13 ON public.rbac_acl_h20_p13;
CREATE TRIGGER tr_rbac_acl_h20_p13
    BEFORE UPDATE
    ON public.rbac_acl_h20_p13
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p14 ON public.rbac_acl_h20_p14;
CREATE TRIGGER tr_rbac_acl_h20_p14
    BEFORE UPDATE
    ON public.rbac_acl_h20_p14
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p15 ON public.rbac_acl_h20_p15;
CREATE TRIGGER tr_rbac_acl_h20_p15
    BEFORE UPDATE
    ON public.rbac_acl_h20_p15
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p16 ON public.rbac_acl_h20_p16;
CREATE TRIGGER tr_rbac_acl_h20_p16
    BEFORE UPDATE
    ON public.rbac_acl_h20_p16
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p17 ON public.rbac_acl_h20_p17;
CREATE TRIGGER tr_rbac_acl_h20_p17
    BEFORE UPDATE
    ON public.rbac_acl_h20_p17
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p18 ON public.rbac_acl_h20_p18;
CREATE TRIGGER tr_rbac_acl_h20_p18
    BEFORE UPDATE
    ON public.rbac_acl_h20_p18
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

DROP TRIGGER IF EXISTS tr_rbac_acl_h20_p19 ON public.rbac_acl_h20_p19;
CREATE TRIGGER tr_rbac_acl_h20_p19
    BEFORE UPDATE
    ON public.rbac_acl_h20_p19
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();

ALTER TABLE public.rbac_acl
    OWNER TO postgres;

ALTER TABLE public.rbac_acl_h20_p0 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p1 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p2 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p3 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p4 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p5 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p6 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p7 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p8 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p9 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p10 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p11 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p12 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p13 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p14 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p15 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p16 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p17 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p18 OWNER TO postgres;
ALTER TABLE public.rbac_acl_h20_p19 OWNER TO postgres;

CREATE INDEX IF NOT EXISTS _sso_rbac_acl__id_recording
    ON public.rbac_acl (id_text) WHERE object_type IN ('recording'::RBAC_OBJECT_TYPE, 'folder'::RBAC_OBJECT_TYPE);

CREATE INDEX IF NOT EXISTS rbac_recording_role_auth_group_id_idx
    ON public.rbac_acl (auth_group_id);

CREATE INDEX IF NOT EXISTS rbac_recording_role_role_id_idx
    ON public.rbac_acl (permission_set_id);

GRANT SELECT ON public.rbac_acl TO readaccess;