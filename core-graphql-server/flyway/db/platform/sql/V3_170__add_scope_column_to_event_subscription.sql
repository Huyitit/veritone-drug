DO $FLYWAY$
BEGIN
  -- create enum type for the scope column of event_subscription table
  DROP TYPE IF EXISTS event_trigger.event_subscription_scope_enum CASCADE;
  CREATE TYPE event_trigger.event_subscription_scope_enum AS ENUM ('Organization', 'Application');
  ALTER TYPE event_trigger.event_subscription_scope_enum OWNER TO postgres;

  -- add column scope to event_subscription table with default value 'Organization'
  ALTER TABLE event_trigger.event_subscription ADD COLUMN IF NOT EXISTS scope event_trigger.event_subscription_scope_enum DEFAULT 'Organization'::event_trigger.event_subscription_scope_enum NOT NULL;
END;
$FLYWAY$
