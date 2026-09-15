-- AWT-7437
ALTER TABLE aiware.node_red_palette
ADD COLUMN IF NOT EXISTS application_id uuid NOT NULL DEFAULT 'db99c65a-70f0-11ed-a1eb-0242ac120002'::uuid;

ALTER TABLE aiware.node_red_palette ALTER COLUMN application_id DROP DEFAULT;

COMMENT ON COLUMN aiware.node_red_palette.application_id IS 'This column stores a reference to the application that this module is to be installed for';
