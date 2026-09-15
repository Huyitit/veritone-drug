ALTER TABLE event_trigger.event_triggers DROP CONSTRAINT IF EXISTS event_org_type_idx;
ALTER TABLE event_trigger.event_triggers
            ADD CONSTRAINT  event_org_type_idx UNIQUE (organization_id, event_name, event_type, target_name);
