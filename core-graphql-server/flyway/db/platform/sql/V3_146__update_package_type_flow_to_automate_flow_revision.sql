-- Change resource type flow to automate_flow_revision
DO $$
DECLARE newVal BOOL;
        curVal BOOL;
BEGIN
	newVal = exists (select *
               FROM unnest(enum_range(NULL::aiware.aiw_package_resource_enum)) as t(name)
               WHERE t.name::text = 'automate_flow_revision');
    curVal = exists (select *
               FROM unnest(enum_range(NULL::aiware.aiw_package_resource_enum)) as t(name)
               WHERE t.name::text = 'flow');
    IF NOT newVal AND NOT curVal THEN
    	ALTER TYPE aiware.aiw_package_resource_enum ADD VALUE IF NOT EXISTS 'automate_flow_revision';
    ELSE 
    	IF NOT newVal AND curVal THEN
    		ALTER TYPE aiware.aiw_package_resource_enum RENAME VALUE 'flow' TO 'automate_flow_revision';
    	END IF;
    END IF;
END $$
