-- reset the olpMigration flag for orgs where it was not properly handled.
UPDATE organization
SET kvp = jsonb_set(kvp::jsonb, '{features,olpMigration}', 'false'::jsonb)
WHERE kvp::jsonb ? 'features' 
AND kvp::jsonb->'features' ? 'olpMigration'
AND kvp::jsonb->'features'->>'olpMigration' = 'true';