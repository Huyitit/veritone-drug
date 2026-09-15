DO $FLYWWAY$
BEGIN
    IF (NOT EXISTS (SELECT * 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = 'public' 
                    AND  TABLE_NAME = 'sdo_updated_ci_1_vbjhxietya')) THEN
        CREATE TABLE public.sdo_updated_ci_1_vbjhxietya
        (
            id uuid NOT NULL,
            data_registry_id uuid NOT NULL,
            data jsonb,
            created_by character varying(3000) COLLATE pg_catalog."default",
            modified_by character varying(3000) COLLATE pg_catalog."default",
            organization_id integer NOT NULL DEFAULT 7682,
            application_id uuid,
            "createdAt" timestamp with time zone NOT NULL,
            "updatedAt" timestamp with time zone NOT NULL,
            CONSTRAINT sdo_updated_ci_1_vbjhxietya_pkey PRIMARY KEY (id),
            CONSTRAINT sdo_updated_ci_1_vbjhxietya_data_registry_id_fkey FOREIGN KEY (data_registry_id)
                REFERENCES public.data_registries (id) MATCH SIMPLE
                ON UPDATE CASCADE
                ON DELETE NO ACTION
        )
        WITH (
            OIDS = FALSE
        )
        TABLESPACE pg_default;

        ALTER TABLE public.sdo_updated_ci_1_vbjhxietya
            OWNER to postgres;

        GRANT ALL ON TABLE public.sdo_updated_ci_1_vbjhxietya TO postgres;

        -- Index: sdo_updated_ci_1_vbjhxietya_created_at

        -- DROP INDEX public.sdo_updated_ci_1_vbjhxietya_created_at;

        CREATE INDEX sdo_updated_ci_1_vbjhxietya_created_at
            ON public.sdo_updated_ci_1_vbjhxietya USING btree
            ("createdAt" DESC)
            TABLESPACE pg_default;

        -- Index: sdo_updated_ci_1_vbjhxietya_data_registry_id

        -- DROP INDEX public.sdo_updated_ci_1_vbjhxietya_data_registry_id;

        CREATE INDEX sdo_updated_ci_1_vbjhxietya_data_registry_id
            ON public.sdo_updated_ci_1_vbjhxietya USING btree
            (data_registry_id)
            TABLESPACE pg_default;

        -- Index: sdo_updated_ci_1_vbjhxietya_organization_id

        -- DROP INDEX public.sdo_updated_ci_1_vbjhxietya_organization_id;

        CREATE INDEX sdo_updated_ci_1_vbjhxietya_organization_id
            ON public.sdo_updated_ci_1_vbjhxietya USING btree
            (organization_id)
            TABLESPACE pg_default;

        -- Trigger: sdo_updated_ci_1_vbjhxietya_trigger

        -- DROP TRIGGER sdo_updated_ci_1_vbjhxietya_trigger ON public.sdo_updated_ci_1_vbjhxietya;

        CREATE TRIGGER sdo_updated_ci_1_vbjhxietya_trigger
            BEFORE INSERT
            ON public.sdo_updated_ci_1_vbjhxietya
            FOR EACH ROW
            EXECUTE PROCEDURE public.sdo_partition_function();
    END IF;
END;
$FLYWWAY$
