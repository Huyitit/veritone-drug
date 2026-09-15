DO $FLYWAY$
BEGIN
	-- remove previous tables for structure change.
	DROP TABLE IF EXISTS public.organization_invite__application_roles CASCADE;
	DROP TABLE IF EXISTS public.organization_invite__invite_action_audit CASCADE;
	DROP TABLE IF EXISTS public.organization_invite CASCADE;
	
	IF (
		NOT EXISTS (
			SELECT *
			FROM INFORMATION_SCHEMA.TABLES
			WHERE TABLE_SCHEMA = 'public'
			AND  TABLE_NAME = 'organization_invite')
	) THEN
		CREATE TABLE public.organization_invite (
			organization_invite_id UUID PRIMARY KEY,
			organization_id INT NOT NULL,
			user_id UUID NOT NULL,
			email VARCHAR(255) NOT NULL,
			message TEXT NULL,
			status TEXT NOT NULL,
			expiration_date INT
		)
		WITH (
			OIDS = FALSE
		)
		TABLESPACE pg_default;

		ALTER TABLE public.organization_invite OWNER to postgres;
	END IF;
-----------------------------------------------------------------------------------------------------------------------------------------
	IF (
		NOT EXISTS (
			SELECT *
			FROM INFORMATION_SCHEMA.TABLES
			WHERE TABLE_SCHEMA = 'public'
			AND  TABLE_NAME = 'organization_invite__application_roles')
	) THEN
		CREATE TABLE public.organization_invite__application_roles (
			id UUID PRIMARY KEY,
			organization_invite_id UUID NOT NULL,
			application_id UUID NOT NULL,
			role_id UUID NOT NULL,
			CONSTRAINT org_invite_app_roles_id FOREIGN KEY (organization_invite_id) REFERENCES public.organization_invite (organization_invite_id),
			CONSTRAINT org_invite_app_roles_app_id FOREIGN KEY (application_id) REFERENCES public.application (application_id),
			CONSTRAINT org_invite_app_roles_role_id FOREIGN KEY (role_id) REFERENCES public.role (role_id)
		)
		WITH (
			OIDS = FALSE
		)
		TABLESPACE pg_default;

		ALTER TABLE public.organization_invite__application_roles OWNER TO postgres;
	END IF;
-----------------------------------------------------------------------------------------------------------------------------------------
	IF (
		NOT EXISTS (
			SELECT *
			FROM INFORMATION_SCHEMA.TABLES
			WHERE TABLE_SCHEMA = 'public'
			AND  TABLE_NAME = 'organization_invite__invite_action_audit')
	) THEN
		CREATE TABLE public.organization_invite__invite_action_audit (
			id UUID PRIMARY KEY,
			organization_invite_id UUID NOT NULL,
			action TEXT NOT NULL,
			prior_status TEXT NOT NULL,
			actor UUID NOT NULL,
			timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
			CONSTRAINT org_invite_audit_id FOREIGN KEY (organization_invite_id) REFERENCES public.organization_invite (organization_invite_id)
		)
		WITH (
			OIDS = FALSE
		)
		TABLESPACE pg_default;

		ALTER TABLE public.organization_invite__invite_action_audit OWNER TO postgres;
	END IF;
END;
$FLYWAY$
