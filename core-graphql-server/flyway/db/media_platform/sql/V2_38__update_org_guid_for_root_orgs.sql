-- Root Admin Org
UPDATE organization 
	SET organization_guid = '7f936a87-8e59-4206-9999-938b0e3c62ab'
WHERE 
	organization_id = @@{ROOT_ORG_ID}@@ AND organization_guid IS NULL;

