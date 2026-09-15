CREATE TABLE IF NOT EXISTS rbac_recording_role (
    auth_group_id uuid NOT NULL,
    role_id uuid NOT NULL,
    recording_id TEXT NOT NULL,
    CONSTRAINT rbac_recording_role_pk PRIMARY KEY (recording_id, auth_group_id, role_id),
    CONSTRAINT rbac_recording_role_fk FOREIGN KEY (auth_group_id) REFERENCES rbac_auth_group(auth_group_id),
    CONSTRAINT rbac_recording_role_fk_1 FOREIGN KEY (role_id) REFERENCES rbac_role(role_id)
);
CREATE INDEX IF NOT EXISTS rbac_recording_role_auth_group_id_idx ON rbac_recording_role USING btree (auth_group_id);
CREATE INDEX IF NOT EXISTS rbac_recording_role_role_id_idx ON rbac_recording_role USING btree (role_id);

CREATE TABLE IF NOT EXISTS rbac_folder_role (
    auth_group_id uuid NOT NULL,
    role_id uuid NOT NULL,
    folder_id TEXT NOT NULL,
    CONSTRAINT rbac_folder_role_pk PRIMARY KEY (folder_id, auth_group_id, role_id),
    CONSTRAINT rbac_folder_role_fk FOREIGN KEY (auth_group_id) REFERENCES rbac_auth_group(auth_group_id),
    CONSTRAINT rbac_folder_role_fk_1 FOREIGN KEY (role_id) REFERENCES rbac_role(role_id)
);
CREATE INDEX IF NOT EXISTS rbac_folder_role_auth_group_id_idx ON rbac_folder_role USING btree (auth_group_id);
CREATE INDEX IF NOT EXISTS rbac_folder_role_role_id_idx ON rbac_folder_role USING btree (role_id);
