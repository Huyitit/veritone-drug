-- Change resource type automate_dependency_palette to automate_palette
DO $$
DECLARE newVal BOOL;
        curVal BOOL;
BEGIN
	newVal = exists (select *
               FROM unnest(enum_range(NULL::aiware.aiw_package_resource_enum)) as t(name)
               WHERE t.name::text = 'automate_palette');
    curVal = exists (select *
               FROM unnest(enum_range(NULL::aiware.aiw_package_resource_enum)) as t(name)
               WHERE t.name::text = 'automate_dependency_palette');
    IF NOT newVal AND NOT curVal THEN
    	ALTER TYPE aiware.aiw_package_resource_enum ADD VALUE IF NOT EXISTS 'automate_palette';
    ELSE 
    	IF NOT newVal AND curVal THEN
    		ALTER TYPE aiware.aiw_package_resource_enum RENAME VALUE 'automate_dependency_palette' TO 'automate_palette';
    	END IF;
    END IF;
END $$