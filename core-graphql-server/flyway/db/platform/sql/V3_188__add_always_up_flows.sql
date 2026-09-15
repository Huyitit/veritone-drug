DROP TYPE IF EXISTS job_new.always_up_flow_status_enum CASCADE;
CREATE TYPE job_new.always_up_flow_status_enum AS ENUM ('active', 'inactive', 'deleted');

CREATE TABLE IF NOT EXISTS job_new.always_up_flow (
    always_up_flow_id uuid NOT NULL PRIMARY KEY,
    organization_id int4 NOT NULL,
    engine_id text NOT NULL,
    build_id text NULL,
    schedule text NOT NULL,
    update_schedule text NOT NULL,
    status job_new.always_up_flow_status_enum NOT NULL,
    restart boolean DEFAULT false,
    date_modified timestamptz NOT NULL default (current_timestamp AT TIME ZONE 'UTC'),
    date_created timestamptz NOT NULL default (current_timestamp AT TIME ZONE 'UTC'),
    created_by text NOT NULL DEFAULT ''::text,
    modified_by text NOT NULL DEFAULT ''::text
);

COMMENT ON TABLE job_new.always_up_flow IS 'Contains the metadata for always up flows. Used by controller to manage node-red-v3 pods';

ALTER TABLE job_new.always_up_flow OWNER TO postgres;
GRANT SELECT ON job_new.always_up_flow TO readaccess;
ALTER table job_new.always_up_flow ADD CONSTRAINT fk_job_new_persistant_flow_engine_id FOREIGN KEY (engine_id) REFERENCES job_new.engine(engine_id) ON DELETE CASCADE;
ALTER table job_new.always_up_flow ADD CONSTRAINT fk_job_new_persistant_flow_build_id FOREIGN KEY (build_id) REFERENCES job_new.build(build_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS always_up_flow_organization_id_idx ON job_new.always_up_flow USING btree (organization_id);
CREATE INDEX IF NOT EXISTS always_up_flow_engine_id_idx ON job_new.always_up_flow USING btree (engine_id);

COMMENT ON COLUMN job_new.always_up_flow.always_up_flow_id IS 'This is the unique id for the schedule for an always up flow.';
COMMENT ON COLUMN job_new.always_up_flow.organization_id IS 'This is the organization the schedule belongs to.';
COMMENT ON COLUMN job_new.always_up_flow.engine_id IS 'This is the engine id associated with the schedule.';
COMMENT ON COLUMN job_new.always_up_flow.build_id IS 'This is the build id associated with the schedule.';
COMMENT ON COLUMN job_new.always_up_flow.schedule IS 'This is the schedule in a cron format.';
COMMENT ON COLUMN job_new.always_up_flow.update_schedule IS 'This is the schedule the always up flow will be checked for an old revision and can be updated if needed.';
COMMENT ON COLUMN job_new.always_up_flow.status IS 'This is the status enum for a schedule as it will never be deleted.';
COMMENT ON COLUMN job_new.always_up_flow.restart IS 'This is the flag used to mark the pod for deletion which will start a new pod defaulting this boolean to false.';
COMMENT ON COLUMN job_new.always_up_flow.date_modified IS 'This is schedules last update time UTC time zone.';
COMMENT ON COLUMN job_new.always_up_flow.date_created IS 'This is datetime the schedule was created UTC time zone.';
COMMENT ON COLUMN job_new.always_up_flow.created_by IS 'This is the user that created the schedule.';
COMMENT ON COLUMN job_new.always_up_flow.modified_by IS 'This is the last user to update the schedule.';