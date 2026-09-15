CREATE TABLE IF NOT EXISTS event_trigger.asset_triggers (
	content_type text NOT NULL,
	"type" text NOT NULL,
	engine_id text NOT NULL,
	scope_type text NULL,
	created_by text NULL,
	updated_by text NULL,
	created_at timestamp NULL,
	updated_at timestamp NULL,
	scope_id text NOT NULL,
	enabled bool NOT NULL,
	description text NULL,
	CONSTRAINT asset_triggers_pk PRIMARY KEY (content_type, type, engine_id, scope_id)
);

ALTER TABLE event_trigger.asset_triggers OWNER TO postgres;
