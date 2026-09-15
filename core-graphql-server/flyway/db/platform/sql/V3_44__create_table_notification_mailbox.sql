CREATE TABLE IF NOT EXISTS event_trigger.notification_mailbox (
    mailbox_id uuid PRIMARY KEY NOT NULL,
    mailbox_name TEXT,
    user_id UUID,
    organization_id INTEGER NOT NULL,
    application_id TEXT NOT NULL,
    conditions JSONB,
    notification_template TEXT DEFAULT '' NOT NULL,
    metadata JSONB,
    limit_count INTEGER,
    is_paused BOOLEAN DEFAULT false NOT NULL,
    total_count INTEGER DEFAULT 0 NOT NULL,
    unread_count INTEGER DEFAULT 0 NOT NULL,
    latest_receipt_date timestamptz,
    date_created timestamptz NOT NULL default (current_timestamp AT TIME ZONE 'UTC'),
    date_modified timestamptz NOT NULL default (current_timestamp AT TIME ZONE 'UTC')
);

COMMENT ON TABLE event_trigger.notification_mailbox IS 'Table for notification mailbox by user, application, and organization.';
COMMENT ON COLUMN event_trigger.notification_mailbox.user_id IS 'If set, it define the own user for current mailbox.';
COMMENT ON COLUMN event_trigger.notification_mailbox.organization_id IS 'This is organization for the mailbox.';
COMMENT ON COLUMN event_trigger.notification_mailbox.application_id IS 'This is application for the mailbox.';
COMMENT ON COLUMN event_trigger.notification_mailbox.conditions IS 'The mailbox eventFilter, it should include eventNames, eventType, and application, etc.';
COMMENT ON COLUMN event_trigger.notification_mailbox.notification_template IS 'The Handlerbars template of mailbox notification.';
COMMENT ON COLUMN event_trigger.notification_mailbox.limit_count IS 'If set, it is the limit count of notification for the mailbox.';
COMMENT ON COLUMN event_trigger.notification_mailbox.is_paused IS 'The flag of mailbox that is paused or active. Default is false.';
COMMENT ON COLUMN event_trigger.notification_mailbox.unread_count IS 'Number of notification which is unread.';
COMMENT ON COLUMN event_trigger.notification_mailbox.latest_receipt_date IS 'The latest notification receipt datetime of mailbox.';

CREATE INDEX IF NOT EXISTS idx_notification_mailbox__user_id ON event_trigger.notification_mailbox USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notification_mailbox__organization_id ON event_trigger.notification_mailbox USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_notification_mailbox__application_id ON event_trigger.notification_mailbox USING btree (application_id);

ALTER TABLE event_trigger.notification_mailbox OWNER TO postgres;
GRANT SELECT ON TABLE event_trigger.notification_mailbox TO readaccess;
