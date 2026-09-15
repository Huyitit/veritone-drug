DO
$do$
BEGIN
	ALTER TABLE public.v2_folder_sdo DROP CONSTRAINT IF EXISTS v2_folder_sdo_pkey;
	ALTER TABLE public.v2_folder_sdo ADD CONSTRAINT v2_folder_sdo_pkey PRIMARY KEY (folder_id, sdo_id);
END;
$do$