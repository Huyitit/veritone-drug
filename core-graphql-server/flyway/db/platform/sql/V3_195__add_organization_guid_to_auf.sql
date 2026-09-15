ALTER TABLE job_new.always_up_flow
    ADD COLUMN IF NOT EXISTS organization_guid uuid;

COMMENT ON COLUMN job_new.always_up_flow.organization_guid IS 'GUID of organization';