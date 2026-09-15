DO $FLYWAY$
BEGIN

    ALTER TABLE IF EXISTS aiware.package__resource ADD COLUMN IF NOT EXISTS resource_alias TEXT;
    ALTER TABLE IF EXISTS aiware.package__resource DROP CONSTRAINT IF EXISTS unique_package_resource_alias;
	ALTER TABLE IF EXISTS aiware.package__resource ADD CONSTRAINT unique_package_resource_alias UNIQUE (package_id, resource_alias);

END;
$FLYWAY$
