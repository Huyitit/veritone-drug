DO
$do$
    BEGIN
        IF EXISTS (
            SELECT FROM pg_catalog.pg_roles
            WHERE  rolname = 'readaccess') THEN

            RAISE NOTICE 'Role "readaccess" already exists. Skipping.';
        ELSE
            CREATE ROLE readaccess;
        END IF;
    END
$do$;

GRANT SELECT ON TABLE public.v2_folder TO readaccess;
GRANT SELECT ON TABLE public.v2_folder_root TO readaccess;
GRANT SELECT ON TABLE public.v2_folder_object TO readaccess;
GRANT SELECT ON TABLE public.v2_folder_type TO readaccess;
GRANT SELECT ON TABLE public.v2_folder_treeobject TO readaccess;
GRANT SELECT ON TABLE public.v2_folder_sdo TO readaccess;