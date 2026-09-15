-- Remove four flow templates from the root organization
DELETE FROM job_new.flow_templates
WHERE title IN (
    'aiWARE Organization User Report Generation',
    'TV Ad Tracker Verification & Summarization',
    'aiWARE EDL Export to Adobe Premiere',
    'Cognitive Engine Shut Off'
) AND (organization_id IS NULL OR organization_id = '@@{ROOT_ORG_ID}@@');
