DO $FLYWWAY$
BEGIN
INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
SELECT '2c8ea2b0-25bc-11f0-892f-996fac40c24b', 'SendEmail', 'media', 7682, 'system',
       'message SendEmail {
           string event = 10;
           string template_name = 11;
       }',
       'da4bcba60605db4824755c8bda7e959ba3731de57b7419cca1b332c8f5087bdb', true, now(), now(), 'veritone', 'veritone', 'veritone event'
    WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'SendEmail' AND event_type = 'media' AND application_id = 'system' );


-- Add the new value 'send_email' to configured_events, deduplicating any existing values
UPDATE aiware.audit_config
SET configured_events = ARRAY(
    SELECT DISTINCT unnest(configured_events || ARRAY[
        'send_email'
    ])
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1;
END;
$FLYWWAY$
