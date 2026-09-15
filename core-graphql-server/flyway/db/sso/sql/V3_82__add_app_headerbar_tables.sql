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

CREATE TABLE IF NOT EXISTS public.app_headerbar
(
    headerbar_id           uuid                   NOT NULL PRIMARY KEY,
    application_id         uuid                   NULL REFERENCES public.application (application_id),
    organization_guid      uuid                   NOT NULL,
    headerbar_name         TEXT                   NOT NULL,
    element_id             TEXT                   NOT NULL,
    title                  TEXT                   NULL,
    background_color       TEXT                   NULL,
    help_enabled           bool                   NULL,
    z_index                INT                    NULL,
    notification_enabled   bool                   NULL,
    display_support_chat   bool                   NULL,
    logo_src               TEXT                   NULL,
    hide_password_reset    bool                   NULL,

    -- standard properties
    date_created       TIMESTAMP              DEFAULT NOW() NOT NULL,
    date_modified      TIMESTAMP              DEFAULT NOW() NOT NULL,

    created_by         uuid                   NOT NULL,
    modified_by        uuid                   NOT NULL,

    CONSTRAINT unq_appid_orgid UNIQUE (application_id,organization_guid)
);
COMMENT ON TABLE public.app_headerbar IS 'Contains application aiware headerbar information.';
COMMENT ON COLUMN public.app_headerbar.application_id IS 'Application ID as UUID.  This specifies which application owns this headerbar';
COMMENT ON COLUMN public.app_headerbar.headerbar_name IS 'Name of the headerbar.';
COMMENT ON COLUMN public.app_headerbar.element_id IS 'The HTML id attribute for the headerbar.';
COMMENT ON COLUMN public.app_headerbar.title IS 'The title to be displayed on the headerbar in the application.';
COMMENT ON COLUMN public.app_headerbar.background_color IS 'Hex value for the background color of the headerbar.';
COMMENT ON COLUMN public.app_headerbar.help_enabled IS 'Flag for if aiWare help should be enabled.';
COMMENT ON COLUMN public.app_headerbar.z_index IS 'The z-index of the headerbar.';
COMMENT ON COLUMN public.app_headerbar.notification_enabled IS 'Flag for if notifications should be enabled.';
COMMENT ON COLUMN public.app_headerbar.display_support_chat IS 'Flag for if support chat should be displayed.';
COMMENT ON COLUMN public.app_headerbar.logo_src IS 'The absolute path to the headerbar logo.';
COMMENT ON COLUMN public.app_headerbar.hide_password_reset IS 'Flag for if password reset should be hidden.';

ALTER TABLE public.app_headerbar OWNER TO postgres;
GRANT SELECT ON TABLE public.app_headerbar TO readaccess;

DROP TRIGGER IF EXISTS tr_modified_config ON public.app_headerbar;
CREATE TRIGGER tr_modified_config
    BEFORE UPDATE
    ON public.app_headerbar
    FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp_date_modified();
