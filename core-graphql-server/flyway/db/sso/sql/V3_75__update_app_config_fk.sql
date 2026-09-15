ALTER TABLE IF EXISTS public.app_config DROP CONSTRAINT IF EXISTS app_config_application_id_fkey1 CASCADE;
ALTER TABLE IF EXISTS public.app_config_definition DROP CONSTRAINT IF EXISTS pk_app_config_default CASCADE;

ALTER TABLE IF EXISTS public.app_config_definition ADD CONSTRAINT pk_app_config_default
    PRIMARY KEY (application_id, config_key);

ALTER TABLE IF EXISTS public.app_config ADD CONSTRAINT app_config_application_id_fkey1
    FOREIGN KEY (application_id, config_key) REFERENCES app_config_definition(application_id, config_key)
        ON DELETE CASCADE ON UPDATE CASCADE;
