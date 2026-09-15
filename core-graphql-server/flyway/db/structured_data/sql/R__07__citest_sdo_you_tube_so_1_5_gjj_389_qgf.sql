-- citests/scheduledJob.js

DO $FLYWWAY$
BEGIN
    IF (NOT EXISTS (SELECT * 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = 'public' 
                    AND  TABLE_NAME = 'sdo_you_tube_so_1_5_gjj_389_qgf')) THEN
        CREATE TABLE public.sdo_you_tube_so_1_5_gjj_389_qgf
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
            CONSTRAINT sdo_you_tube_so_1_5_gjj_389_qgf_pkey PRIMARY KEY (id),
            CONSTRAINT sdo_you_tube_so_1_5_gjj_389_qgf_data_registry_id_fkey FOREIGN KEY (data_registry_id)
                REFERENCES public.data_registries (id) MATCH SIMPLE
                ON UPDATE CASCADE
                ON DELETE NO ACTION
        )
        WITH (
            OIDS = FALSE
        )
        TABLESPACE pg_default;

        ALTER TABLE public.sdo_you_tube_so_1_5_gjj_389_qgf
            OWNER to postgres;


        GRANT ALL ON TABLE public.sdo_you_tube_so_1_5_gjj_389_qgf TO postgres;

        -- Index: sdo_you_tube_so_1_5_gjj_389_qgf_created_at

        -- DROP INDEX public.sdo_you_tube_so_1_5_gjj_389_qgf_created_at;

        CREATE INDEX sdo_you_tube_so_1_5_gjj_389_qgf_created_at
            ON public.sdo_you_tube_so_1_5_gjj_389_qgf USING btree
            ("createdAt" DESC NULLS FIRST)
            TABLESPACE pg_default;


        -- Index: sdo_you_tube_so_1_5_gjj_389_qgf_data_registry_id

        -- DROP INDEX public.sdo_you_tube_so_1_5_gjj_389_qgf_data_registry_id;

        CREATE INDEX sdo_you_tube_so_1_5_gjj_389_qgf_data_registry_id
            ON public.sdo_you_tube_so_1_5_gjj_389_qgf USING btree
            (data_registry_id ASC NULLS LAST)
            TABLESPACE pg_default;


        -- Index: sdo_you_tube_so_1_5_gjj_389_qgf_organization_id

        -- DROP INDEX public.sdo_you_tube_so_1_5_gjj_389_qgf_organization_id;

        CREATE INDEX sdo_you_tube_so_1_5_gjj_389_qgf_organization_id
            ON public.sdo_you_tube_so_1_5_gjj_389_qgf USING btree
            (organization_id ASC NULLS LAST)
            TABLESPACE pg_default;


        -- Trigger: sdo_you_tube_so_1_5_gjj_389_qgf_trigger

        -- DROP TRIGGER sdo_you_tube_so_1_5_gjj_389_qgf_trigger ON public.sdo_you_tube_so_1_5_gjj_389_qgf;

        CREATE TRIGGER sdo_you_tube_so_1_5_gjj_389_qgf_trigger
            BEFORE INSERT
            ON public.sdo_you_tube_so_1_5_gjj_389_qgf
            FOR EACH ROW
            EXECUTE PROCEDURE public.sdo_partition_function();
    END IF;
END;
$FLYWWAY$
