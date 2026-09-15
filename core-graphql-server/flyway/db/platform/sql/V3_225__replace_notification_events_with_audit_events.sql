-- Step 1: Remove the notification event values from baseline_events and configured_events
UPDATE aiware.audit_config
SET
    baseline_events = array_remove(array_remove(baseline_events, 'new_version_installed'), 'new_version_available'),
    configured_events = array_remove(array_remove(configured_events, 'new_version_installed'), 'new_version_available')
WHERE
    'new_version_installed' = ANY(baseline_events) OR
    'new_version_available' = ANY(baseline_events) OR
    'new_version_installed' = ANY(configured_events) OR
    'new_version_available' = ANY(configured_events);

-- Step 2: Add the new audit log event strings to baseline_events
UPDATE aiware.audit_config
SET
    baseline_events = CASE
        WHEN array_position(baseline_events, 'platform_new_version_installed') IS NULL
        THEN array_append(baseline_events, 'platform_new_version_installed')
        ELSE baseline_events
    END,
    configured_events = CASE
        WHEN array_position(configured_events, 'platform_new_version_available') IS NULL
        THEN array_append(configured_events, 'platform_new_version_available')
        ELSE configured_events
    END
WHERE
    TRUE;
