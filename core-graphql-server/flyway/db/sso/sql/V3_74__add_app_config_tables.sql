-- SSO schema
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

DROP TYPE IF EXISTS type_config_value_enum CASCADE;
CREATE TYPE type_config_value_enum
AS ENUM (
    'string', 'boolean', 'date', 'integer', 'json', 'float'
    );
COMMENT ON TYPE type_config_value_enum IS 'Type for config values';

DROP TYPE IF EXISTS type_config_level CASCADE;
CREATE TYPE type_config_level
AS ENUM (
    'organization', 'user'
    );
COMMENT ON TYPE type_config_level IS 'Type for config level';

DROP TABLE IF EXISTS app_config_definition CASCADE; -- requered BY the DROP TYPE above 
CREATE TABLE IF NOT EXISTS public.app_config_definition
(
    application_id     uuid                   NULL REFERENCES public.application (application_id),
    organization_guid  uuid                   NOT NULL,
    config_key         TEXT                   NOT NULL,
    config_type        type_config_value_enum NOT NULL DEFAULT 'string'::type_config_value_enum,
    config_level       type_config_level      NOT NULL DEFAULT 'organization'::type_config_level,
    is_required        bool                   NOT NULL DEFAULT FALSE,
    is_secured         bool                   NOT NULL DEFAULT FALSE,

    config_description TEXT                   NOT NULL,

    default_value      TEXT                   NULL,
    default_value_json jsonb                  NOT NULL DEFAULT '{}'::jsonb,

    date_created       TIMESTAMP                       DEFAULT NOW() NOT NULL,
    date_modified      TIMESTAMP                       DEFAULT NOW() NOT NULL,

    created_by         uuid                   NOT NULL,
    modified_by        uuid                   NOT NULL,

    CONSTRAINT pk_app_config_default PRIMARY KEY (application_id, organization_guid, config_key)
);
COMMENT ON TABLE public.app_config_definition IS 'Contains the defaults for app config';
COMMENT ON COLUMN public.app_config_definition.application_id IS 'Application ID as UUID.  This specifies which application owns this configuration';
COMMENT ON COLUMN public.app_config_definition.config_key IS 'Name of the key for the config.  This can be namespaced with .';
COMMENT ON COLUMN public.app_config_definition.config_type IS 'Value type enum. default is string';
COMMENT ON COLUMN public.app_config_definition.config_level IS 'Config settings level.  default is organization';
COMMENT ON COLUMN public.app_config_definition.is_required IS 'Bool.  If true, this config value must be set';
COMMENT ON COLUMN public.app_config_definition.is_required IS 'Bool.  If true, this config should be secured';
COMMENT ON COLUMN public.app_config_definition.config_description IS 'Config description';
COMMENT ON COLUMN public.app_config_definition.default_value IS 'Default value stored as a string';
COMMENT ON COLUMN public.app_config_definition.default_value_json IS 'If JSON, this column stores the default value';

ALTER TABLE public.app_config_definition
    OWNER TO postgres;


CREATE TABLE IF NOT EXISTS public.app_config
(
    application_id    uuid                          NOT NULL REFERENCES public.application (application_id),
    user_id           uuid                          NULL REFERENCES public.sso_user (user_id),
    organization_guid uuid                          NOT NULL,

    config_key        TEXT                          NOT NULL,
    config_value      TEXT,
    config_json       jsonb     DEFAULT '{}'::jsonb NOT NULL,

    -- standard properties
    date_created      TIMESTAMP DEFAULT NOW()       NOT NULL,
    date_modified     TIMESTAMP DEFAULT NOW()       NOT NULL,

    created_by        uuid                          NOT NULL,
    modified_by       uuid                          NOT NULL,

    FOREIGN KEY (application_id, organization_guid, config_key) REFERENCES public.app_config_definition (application_id, organization_guid, config_key) ON DELETE CASCADE,
    CONSTRAINT pk_app_config PRIMARY KEY (application_id, organization_guid, user_id, config_key)
);

COMMENT ON TABLE public.app_config IS 'This stores the application configs.  aiWARE configs will be stored under datacenter, developer or admin app IDs';
COMMENT ON COLUMN public.app_config.application_id IS 'Application ID UUID for the config';
COMMENT ON COLUMN public.app_config.user_id IS 'User ID UUID for the config setting';
COMMENT ON COLUMN public.app_config.config_key IS 'Config key';
COMMENT ON COLUMN public.app_config.config_value IS 'User ID UUID for the config setting';
COMMENT ON COLUMN public.app_config.config_json IS 'User ID UUID for the config setting';


ALTER TABLE public.app_config
    OWNER TO postgres;

DROP TRIGGER IF EXISTS tr_modified_config ON public.app_config;
CREATE TRIGGER tr_modified_config
    BEFORE UPDATE
    ON public.app_config
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();
