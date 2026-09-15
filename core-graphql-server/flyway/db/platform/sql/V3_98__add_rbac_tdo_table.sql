CREATE SCHEMA IF NOT EXISTS rbac;
ALTER SCHEMA rbac OWNER TO postgres;
GRANT USAGE ON SCHEMA rbac TO readaccess;

CREATE TABLE IF NOT EXISTS rbac.acl_recording (
	recording_id text NOT NULL,
	auth_group_id uuid NOT NULL,
	permission_set_id uuid NOT NULL,
	CONSTRAINT acl_recording_pk PRIMARY KEY (auth_group_id, recording_id, permission_set_id)
);

ALTER TABLE rbac.acl_recording OWNER TO postgres;
GRANT SELECT ON TABLE rbac.acl_recording TO readaccess;
