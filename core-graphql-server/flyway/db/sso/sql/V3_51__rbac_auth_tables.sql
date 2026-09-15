CREATE TABLE IF NOT EXISTS rbac_auth_group(
	auth_group_id uuid NOT NULL,
	auth_group_name VARCHAR(100) NOT NULL,
	auth_group_description text,
	organization_guid uuid NOT NULL,
	kvp json NULL,
	date_created timestamp NOT NULL DEFAULT now(),
	date_modified timestamp NOT NULL DEFAULT now(),
	modified_by uuid NOT NULL,
	CONSTRAINT "_pk_sso_rbac_auth_group@auth_group_id" PRIMARY KEY (auth_group_id)
);
CREATE INDEX IF NOT EXISTS "_ix_sso_rbac_auth_group@organization_guid" ON rbac_auth_group USING btree (organization_guid);


CREATE TABLE IF NOT EXISTS rbac_role (
	role_name varchar(100) NOT NULL,
	role_description varchar(500) NULL,
	permissions varbit NOT NULL,
	date_created timestamp NOT NULL DEFAULT now(),
	date_modified timestamp NOT NULL DEFAULT now(),
	role_id uuid NOT NULL,
	CONSTRAINT rbac_role_pk PRIMARY KEY (role_id)
);
CREATE INDEX IF NOT EXISTS rbac_role_role_name_idx ON rbac_role USING btree (role_name);


CREATE TABLE IF NOT EXISTS rbac_auth_group_member (
	auth_group_id uuid NOT NULL,
	member_id uuid NOT NULL,
	is_group bool NULL,
	CONSTRAINT rbac_auth_group_member_pk PRIMARY KEY (auth_group_id, member_id),
	CONSTRAINT rbac_auth_group_member_fk FOREIGN KEY (auth_group_id) REFERENCES rbac_auth_group(auth_group_id)
);
CREATE INDEX IF NOT EXISTS rbac_auth_group_member_member_id_idx ON rbac_auth_group_member USING btree (member_id);


CREATE TABLE IF NOT EXISTS rbac_organization_role (
	organization_id uuid NOT NULL,
	auth_group_id uuid NOT NULL,
	role_id uuid NOT NULL,
	CONSTRAINT rbac_organization_role_pk PRIMARY KEY (organization_id, auth_group_id, role_id),
	CONSTRAINT rbac_organization_role_fk FOREIGN KEY (auth_group_id) REFERENCES rbac_auth_group(auth_group_id),
	CONSTRAINT rbac_organization_role_fk_1 FOREIGN KEY (role_id) REFERENCES rbac_role(role_id)
);
CREATE INDEX IF NOT EXISTS rbac_organization_role_organization_id_idx ON rbac_organization_role USING btree (organization_id, auth_group_id);