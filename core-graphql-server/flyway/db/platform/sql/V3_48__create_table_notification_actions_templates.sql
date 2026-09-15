CREATE TABLE IF NOT EXISTS event_trigger.notification_templates (
	template_id UUID DEFAULT public.uuid_generate_v4() PRIMARY KEY NOT NULL,
	event_name TEXT NOT NULL,
	event_type TEXT NOT NULL,
	title TEXT NOT NULL,
	body TEXT NOT NULL,
	owner_organization_id INTEGER NOT NULL,
	owner_application_id TEXT NOT NULL,
	application_id TEXT,
	mailbox_id UUID,
	date_created TIMESTAMPTZ NOT NULL DEFAULT (current_timestamp AT TIME ZONE 'UTC'),
	date_modified TIMESTAMPTZ NOT NULL DEFAULT (current_timestamp AT TIME ZONE 'UTC')
);

COMMENT ON TABLE event_trigger.notification_templates IS 'Table for notification templates by event_type, event_name, and application_id.';
COMMENT ON COLUMN event_trigger.notification_templates.event_name IS 'This define the event name of notification template.';
COMMENT ON COLUMN event_trigger.notification_templates.event_type IS 'This define the event type of notification template.';
COMMENT ON COLUMN event_trigger.notification_templates.title IS 'Title of the notification.';
COMMENT ON COLUMN event_trigger.notification_templates.body IS 'It is the notification body template.';
COMMENT ON COLUMN event_trigger.notification_templates.owner_organization_id IS 'Owner organization of notification template.';
COMMENT ON COLUMN event_trigger.notification_templates.owner_application_id IS 'Owner application of notification template.';
COMMENT ON COLUMN event_trigger.notification_templates.application_id IS 'If it set, it define the application of notification template.';
COMMENT ON COLUMN event_trigger.notification_templates.mailbox_id IS 'If it set, it define the mailbox that notification template apply for.';

CREATE INDEX IF NOT EXISTS idx_notification_templates__event_name ON event_trigger.notification_templates USING btree(event_name);
CREATE INDEX IF NOT EXISTS idx_notification_templates__event_type ON event_trigger.notification_templates USING btree(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_templates__owner_organization_id ON event_trigger.notification_templates USING btree(owner_organization_id);
CREATE INDEX IF NOT EXISTS idx_notification_templates__owner_application_id ON event_trigger.notification_templates USING btree(owner_application_id);
CREATE INDEX IF NOT EXISTS idx_notification_templates__application_id ON event_trigger.notification_templates USING btree(application_id) WHERE (application_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notification_templates__mailbox_id ON event_trigger.notification_templates USING btree(mailbox_id) WHERE (mailbox_id IS NOT NULL);

ALTER TABLE event_trigger.notification_templates OWNER TO postgres;
GRANT SELECT ON TABLE event_trigger.notification_templates TO readaccess;

CREATE TABLE IF NOT EXISTS event_trigger.notification_actions (
	action_id uuid DEFAULT public.uuid_generate_v4() PRIMARY KEY NOT NULL,
	event_name TEXT NOT NULL,
	event_type TEXT NOT NULL,
	action_name TEXT,
	icon TEXT,
	url_template TEXT NOT NULL,
	owner_organization_id INTEGER NOT NULL,
	owner_application_id TEXT NOT NULL,
	application_id TEXT,
	mailbox_id UUID,
	date_created TIMESTAMPTZ NOT NULL DEFAULT (current_timestamp AT TIME ZONE 'UTC'),
	date_modified TIMESTAMPTZ NOT NULL DEFAULT (current_timestamp AT TIME ZONE 'UTC')
);

COMMENT ON TABLE event_trigger.notification_actions IS 'Table for notification action by event_type, event_name, and application_id.';
COMMENT ON COLUMN event_trigger.notification_actions.event_name IS 'This define the event name of notification action.';
COMMENT ON COLUMN event_trigger.notification_actions.event_type IS 'This define the event type of notification action.';
COMMENT ON COLUMN event_trigger.notification_actions.action_name IS 'Name of the notification action.';
COMMENT ON COLUMN event_trigger.notification_actions.icon IS 'It is the notification action icon (handlebars).';
COMMENT ON COLUMN event_trigger.notification_actions.owner_organization_id IS 'Owner organization of notification action.';
COMMENT ON COLUMN event_trigger.notification_actions.owner_application_id IS 'Owner application of notification action.';
COMMENT ON COLUMN event_trigger.notification_actions.application_id IS 'If it set, it define the application of notification action.';
COMMENT ON COLUMN event_trigger.notification_actions.mailbox_id IS 'If it set, it define the mailbox that notification action apply for.';

CREATE INDEX IF NOT EXISTS idx_notification_actions__event_name ON event_trigger.notification_actions USING btree(event_name);
CREATE INDEX IF NOT EXISTS idx_notification_actions__event_type ON event_trigger.notification_actions USING btree(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_actions__owner_organization_id ON event_trigger.notification_actions USING btree(owner_organization_id);
CREATE INDEX IF NOT EXISTS idx_notification_actions__owner_application_id ON event_trigger.notification_actions USING btree(owner_application_id);
CREATE INDEX IF NOT EXISTS idx_notification_actions__application_id ON event_trigger.notification_actions USING btree(application_id) WHERE (application_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notification_actions__mailbox_id ON event_trigger.notification_actions USING btree(mailbox_id) WHERE (mailbox_id IS NOT NULL);

ALTER TABLE event_trigger.notification_actions OWNER TO postgres;
GRANT SELECT ON TABLE event_trigger.notification_actions TO readaccess;