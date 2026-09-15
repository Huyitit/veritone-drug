DROP TABLE IF EXISTS public.application_metadata CASCADE;
CREATE TABLE IF NOT EXISTS public.application_metadata
(
    application_id          UUID NOT null,
    type                    VARCHAR NOT null,
    content                   jsonb NOT null,
    PRIMARY KEY             (application_id, type)
);
