DO $FLYWWAY$
BEGIN
  UPDATE event_trigger."event" 
  SET	schema_data = 'message PackageGrantSet {
			string package_id = 10;
			string package_name = 11;
			int64 organization_id = 12;
			string organization_name = 13;
			string grant_type = 14;
			string token = 15;
		}',
    schema_hash = '12fb8fd26bfe247977a6244655033619757becec04aff8f1cc187c5bcf305179'
  WHERE   event_name = 'PackageGrantSet'
    AND event_type = 'package'
    AND application_id = 'system';

  UPDATE event_trigger."event" 
  SET	schema_data = 'message PackageGrantRemoved {
			string package_id = 10;
			string package_name = 11;
			int64 organization_id = 12;
			string organization_name = 13;
			string grant_type = 14;
			string token = 15;
		}',
    schema_hash = '5eb7f0ddb75d59ab17ed1fa221bb17a78b0c26c16c5f30dd0d063f466b063f0c'
  WHERE   event_name = 'PackageGrantRemoved'
    AND event_type = 'package'
    AND application_id = 'system';
END;
$FLYWWAY$
