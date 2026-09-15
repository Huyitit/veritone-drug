-- set the ownership and access permission for readaccess 
ALTER TABLE public.application_metadata OWNER TO postgres;
GRANT SELECT ON public.application_metadata TO readaccess;