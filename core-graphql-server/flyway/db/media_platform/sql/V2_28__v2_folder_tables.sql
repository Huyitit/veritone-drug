-- NOTE: Features deprecated
--  1. Sharing though still in the model
--  2. order index

-- For performance testing, see github/veritone/runbook/20_CORE/projects/olp/scenario2.py

-- Old system
-- root_folder -- merged to tree_folder
-- root_folder_type -- Type of root folder
-- tree_object_type - obect type - static but can be changed -- kept
-- tree_object_status - simple enum, active/deleted -- turn to enum
-- tree_object -- reference table of things on a folder tree -- merged to v2_folder_objects
-- tree_object_closure -- basically edges of the graph -- merged to v2_folder_objects
-- tree_folder -- folders that can be added to the graph -- kept
-- tree_object_content_template -- content template for folder

-- +-------------------+-------+
-- |tree_object_type_id|count  |
-- +-------------------+-------+
-- |1                  |351025 | -- Folder
-- |2                  |88337  | -- Watchlist
-- |3                  |62361  | -- Collection
-- |4                  |78833  | -- Roots
-- |5                  |1,542,245| -- TDO
-- +-------------------+-------+

CREATE OR REPLACE FUNCTION public.trigger_v2_folder_date_modified() RETURNS TRIGGER
    LANGUAGE plpgsql
AS
$$
BEGIN
    -- Process:
    -- 1. update modified date
    -- 2. set path
    new.date_modified = NOW();
    RETURN new;
END;
$$;
ALTER FUNCTION public.trigger_v2_folder_date_modified() OWNER TO postgres;

DROP TABLE IF EXISTS public.v2_folder_type CASCADE;
CREATE TABLE IF NOT EXISTS public.v2_folder_type
(
    folder_type_id          SERIAL NOT NULL PRIMARY KEY,
    folder_type_name        TEXT      NOT NULL, -- existing

    -- for types of folders
    folder_type_image       TEXT,
    folder_type_description TEXT,

    content_template_schema_id uuid NULL,     -- content template sdo schema

    -- for custom/owned folder types
    organization_id         INTEGER      NULL REFERENCES public.organization (organization_id),
    application_id          uuid      NULL,

    
    -- standard hygiene
    created_by              uuid      NULL,
    modified_by             uuid      NULL,
    date_created            TIMESTAMPTZ(6)      NOT NULL DEFAULT NOW(),
    date_modified           TIMESTAMPTZ(6)      NOT NULL DEFAULT NOW()
);
ALTER TABLE public.v2_folder_type
    OWNER TO postgres;

CREATE TRIGGER tr_v2_folder_type
    BEFORE UPDATE
    ON public.v2_folder_type
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_v2_folder_date_modified();

COMMENT ON TABLE public.v2_folder_type IS 'This table contains the types of folders.  Folders can augmented with custom data and behaviour';
COMMENT ON COLUMN public.v2_folder_type.folder_type_id IS 'This is the ID of the folder type.  A folder type can be a content template which means it has custom metadata';
COMMENT ON COLUMN public.v2_folder_type.folder_type_name IS 'This is the description of the folder type';
COMMENT ON COLUMN public.v2_folder_type.organization_id IS 'Organization ID that owns this folder type';
COMMENT ON COLUMN public.v2_folder_type.application_id IS 'Application that owns this folder type.  E.g., case folder in redact.  This can be null';
COMMENT ON COLUMN public.v2_folder_type.folder_type_image IS 'Image';
COMMENT ON COLUMN public.v2_folder_type.folder_type_description IS 'Description';
COMMENT ON COLUMN public.v2_folder_type.content_template_schema_id IS 'Schema ID for custom metadata';

CREATE INDEX idx_v2_folder_type_app ON public.v2_folder_type (application_id);
CREATE INDEX idx_v2_folder_type_org ON public.v2_folder_type (organization_id);

----------------------------------------------------------------------------
-- v2_folder
-- This is all the folders. This will be partitioned by orgid
----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS ltree WITH SCHEMA public;

DROP TABLE IF EXISTS public.v2_folder CASCADE;
CREATE TABLE IF NOT EXISTS public.v2_folder
(
    folder_id                  uuid PRIMARY KEY,
    folder_type_id             INTEGER  NOT NULL REFERENCES public.v2_folder_type (folder_type_id),
    organization_id            INTEGER NOT NULL, -- REFERENCES public.organization (organization_id), -- add foreign key later after all org ownership is resolved

    -- folder name
    folder_name                TEXT    NOT NULL,
    folder_description         TEXT    NOT NULL,
    parent_folder_id           uuid  NULL REFERENCES public.v2_folder (folder_id),

    -- shared settings
    shared_org_read            INTEGER[],
    shared_org_write           INTEGER[],

    -- for optimization of queries
    folder_path                       ltree   NOT NULL,

    -- standard metrics
    created_by                 uuid    NULL,
    modified_by                uuid    NULL,
    date_created               TIMESTAMPTZ(6)    NOT NULL DEFAULT NOW(),
    date_modified              TIMESTAMPTZ(6)             DEFAULT NOW()
);

CREATE INDEX path_gist_idx ON public.v2_folder USING GIST (folder_path);

ALTER TABLE public.v2_folder
    OWNER TO postgres;

COMMENT ON TABLE public.v2_folder IS 'This represents a folder in aiWARE';
COMMENT ON COLUMN public.v2_folder.folder_id IS 'ID. Bigserial';
COMMENT ON COLUMN public.v2_folder.folder_type_id IS 'Foreign Key for v2_folder_type.  This controls the custom metadata and any additional behaviours';
COMMENT ON COLUMN public.v2_folder.organization_id IS 'Org ID as INT';
COMMENT ON COLUMN public.v2_folder.folder_name IS 'Folder name';
COMMENT ON COLUMN public.v2_folder.folder_description IS 'Folder description';
COMMENT ON COLUMN public.v2_folder.parent_folder_id IS 'Parent folder id';
COMMENT ON COLUMN public.v2_folder.shared_org_read IS 'Int array of ORG IDs this folder is shared to as read. This is deprecated';
COMMENT ON COLUMN public.v2_folder.shared_org_write IS 'Int array of ORG IDs this folder is shared to as write.  This is deprecated';
COMMENT ON COLUMN public.v2_folder.folder_path IS 'This is the path of the folder.  This is for easy queries of folder trees';

CREATE OR REPLACE FUNCTION public.trigger_v2_folder()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
DECLARE
    parent_path VARCHAR;
BEGIN
    -- Process:
    -- 1. update modified date
    -- 2. set path
    new.date_modified = NOW();

    -- update path if changed or null
    IF old.parent_folder_id != new.parent_folder_id OR new.folder_path IS NULL THEN
        IF new.parent_folder_id IS NULL THEN
            new.folder_path = text2ltree(REPLACE(new.folder_id::text, '-', '_'));
        ELSE
            parent_path = (SELECT folder_path FROM public.v2_folder WHERE folder_id = new.parent_folder_id);
            new.folder_path = parent_path || text2ltree(REPLACE(new.folder_id::text, '-', '_'));
            UPDATE public.v2_folder SET
            folder_path = new.folder_path || subpath(folder_path, nlevel(old.folder_path))
            WHERE folder_path <@ old.folder_path AND folder_id <> old.folder_id;
        END IF;
    END IF;

    RETURN new;
END;
$$;

ALTER FUNCTION public.trigger_v2_folder() OWNER TO postgres;

CREATE TRIGGER tr_v2_folder
    BEFORE INSERT OR UPDATE
    ON public.v2_folder
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_v2_folder();

----------------------------------------------------------------------------
-- v2_folder_root
-- This holds the mapping of folder to root folder of user/organization
----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.v2_folder_root;
CREATE TABLE IF NOT EXISTS public.v2_folder_root (
    -- root folder settings
 	folder_id                  uuid NOT NULL REFERENCES public.v2_folder (folder_id),
    organization_id int NOT NULL,
    root_folder_application_id uuid    NULL,
    root_folder_user_id        uuid    NULL
);

----------------------------------------------------------------------------
-- v2_folder_object
-- This holds the objects inside the folder
----------------------------------------------------------------------------

DROP TYPE IF EXISTS public.type_folder_object_type CASCADE;
CREATE TYPE public.type_folder_object_type AS ENUM ('watchlist', 'collection', 'tdo', 'application');

DROP TABLE IF EXISTS public.v2_folder_object;
CREATE TABLE IF NOT EXISTS public.v2_folder_object
(
    -- PK: org_id, folder_object_type, folder_object_id, folder_id
    organization_id INTEGER                        NOT NULL, -- REFERENCES public.organization (organization_id) - add FK constraint when organization_id is resolved
    object_type     public.type_folder_object_type NOT NULL DEFAULT 'tdo'::public.type_folder_object_type,
    object_id       TEXT                           NOT NULL,
    folder_id       uuid                           NOT NULL REFERENCES public.v2_folder (folder_id),

    -- standard metrics
    created_by      uuid                           NULL,
    modified_by     uuid                           NULL,
    date_created    TIMESTAMPTZ(6)                           NOT NULL DEFAULT NOW(),
    date_modified   TIMESTAMPTZ(6)                           NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_v2_folder_object PRIMARY KEY (organization_id, object_type, object_id, folder_id)
) PARTITION BY HASH (organization_id, object_type);
ALTER TABLE public.v2_folder_object
    OWNER TO postgres;

COMMENT ON TABLE public.v2_folder_object IS 'Contains all the objects of folders in aiWARE';
COMMENT ON COLUMN public.v2_folder_object.organization_id IS 'Organization ID as INT';
COMMENT ON COLUMN public.v2_folder_object.object_type IS 'Object Type';
COMMENT ON COLUMN public.v2_folder_object.organization_id IS 'object_id ID as INT';
COMMENT ON COLUMN public.v2_folder_object.organization_id IS 'folder_id ID as INT';
COMMENT ON COLUMN public.v2_folder_object.organization_id IS 'Organization ID as INT';
COMMENT ON COLUMN public.v2_folder_object.organization_id IS 'Organization ID as INT';
COMMENT ON COLUMN public.v2_folder_object.organization_id IS 'Organization ID as INT';

CREATE TRIGGER tr_v2_folder_object
    AFTER UPDATE
    ON public.v2_folder_object
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_v2_folder_date_modified();

-- Partition
CREATE TABLE public.v2_folder_object_h20_p0 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 0);
CREATE TABLE public.v2_folder_object_h20_p1 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 1);
CREATE TABLE public.v2_folder_object_h20_p2 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 2);
CREATE TABLE public.v2_folder_object_h20_p3 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 3);
CREATE TABLE public.v2_folder_object_h20_p4 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 4);
CREATE TABLE public.v2_folder_object_h20_p5 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 5);
CREATE TABLE public.v2_folder_object_h20_p6 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 6);
CREATE TABLE public.v2_folder_object_h20_p7 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 7);
CREATE TABLE public.v2_folder_object_h20_p8 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 8);
CREATE TABLE public.v2_folder_object_h20_p9 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 9);
CREATE TABLE public.v2_folder_object_h20_p10 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 10);
CREATE TABLE public.v2_folder_object_h20_p11 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 11);
CREATE TABLE public.v2_folder_object_h20_p12 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 12);
CREATE TABLE public.v2_folder_object_h20_p13 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 13);
CREATE TABLE public.v2_folder_object_h20_p14 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 14);
CREATE TABLE public.v2_folder_object_h20_p15 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 15);
CREATE TABLE public.v2_folder_object_h20_p16 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 16);
CREATE TABLE public.v2_folder_object_h20_p17 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 17);
CREATE TABLE public.v2_folder_object_h20_p18 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 18);
CREATE TABLE public.v2_folder_object_h20_p19 PARTITION OF public.v2_folder_object FOR VALUES WITH (MODULUS 20, REMAINDER 19);


----------------------------------------------------------------------------
-- v2_folder_sdo
-- This holds the sdo objects attached to the folder
----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.v2_folder_sdo;
CREATE TABLE IF NOT EXISTS public.v2_folder_sdo (
 	folder_id                  uuid NOT NULL REFERENCES public.v2_folder (folder_id),

    content_template_schema_id uuid NOT NULL,
    sdo_id text NOT NULL,
-- standard metrics
created_by uuid NULL,
    modified_by uuid NULL,
    date_created TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    date_modified TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.v2_folder_sdo.sdo_id IS 'the id of structured data object of type content_templte_schema_id';
COMMENT ON COLUMN public.v2_folder_sdo.content_template_schema_id IS 'Structured data schema id which sdo_data is compliant to';
