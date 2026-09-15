DO $FLYWWAY$
BEGIN
	INSERT INTO event_trigger.event (
		event_id,
		event_name,
		event_type,
		organization_id,
		application_id,
		schema_data,
		schema_hash,
		public,
		created_at_utc,
		updated_at_utc,
		created_by,
		updated_by,
		description
	) SELECT 
		'3d51ddb3-6f4c-43d0-9471-11f6a484a6fd',
		'PackageCreated',
		'package',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message PackageCreated {
			string package_id = 10;
			string package_name = 11;
		}',
		'1ffd0506100756ec0ab02d5fe03b805c672e905ad7bb7521316c73edc0e055ac',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'veritone event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'PackageCreated' AND event_type = 'package' AND application_id = 'system'
	);

	INSERT INTO event_trigger.event (
		event_id,
		event_name,
		event_type,
		organization_id,
		application_id,
		schema_data,
		schema_hash,
		public,
		created_at_utc,
		updated_at_utc,
		created_by,
		updated_by,
		description
	) SELECT 
		'bf34bc8f-0d18-4385-953f-5581c31b0f6d',
		'PackageDeleted',
		'package',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message PackageDeleted {
			string package_id = 10;
			string package_name = 11;
		}',
		'80fba152d561d0d132c763734ec173d08d0930095112127e11227aebe04c7a7e',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'veritone event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'PackageDeleted' AND event_type = 'package' AND application_id = 'system'
	);

  INSERT INTO event_trigger.event (
		event_id,
		event_name,
		event_type,
		organization_id,
		application_id,
		schema_data,
		schema_hash,
		public,
		created_at_utc,
		updated_at_utc,
		created_by,
		updated_by,
		description
	) SELECT 
		'4efac6e6-1293-4aa5-a546-8dd5d841328c',
		'PackageApproved',
		'package',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message PackageApproved {
			string package_id = 10;
			string package_name = 11;
		}',
		'bc7d1a1384042fe6cdae467f7bbf12da0ed8f00f7a7716c01620dda2a3ff00ee',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'veritone event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'PackageApproved' AND event_type = 'package' AND application_id = 'system'
	);

  INSERT INTO event_trigger.event (
		event_id,
		event_name,
		event_type,
		organization_id,
		application_id,
		schema_data,
		schema_hash,
		public,
		created_at_utc,
		updated_at_utc,
		created_by,
		updated_by,
		description
	) SELECT 
		'cf456e7d-31f8-415e-82de-33349accd8ba',
		'PackageRejected',
		'package',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message PackageRejected {
			string package_id = 10;
			string package_name = 11;
		}',
		'a1c6b23dc4650070112c87589f5cb6dbefbec37c028d58782204103823eec981',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'veritone event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'PackageRejected' AND event_type = 'package' AND application_id = 'system'
	);

  INSERT INTO event_trigger.event (
		event_id,
		event_name,
		event_type,
		organization_id,
		application_id,
		schema_data,
		schema_hash,
		public,
		created_at_utc,
		updated_at_utc,
		created_by,
		updated_by,
		description
	) SELECT 
		'2df4dcfb-a63e-47c6-917f-2ef4756eca91',
		'PackageInstalled',
		'package',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message PackageInstalled {
			string package_id = 10;
			string package_name = 11;
		}',
		'4630cd4f6c6144d79010e010f09c3c2133d1336e67e3c9e57b4d617f1d363116',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'veritone event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'PackageInstalled' AND event_type = 'package' AND application_id = 'system'
	);

  INSERT INTO event_trigger.event (
		event_id,
		event_name,
		event_type,
		organization_id,
		application_id,
		schema_data,
		schema_hash,
		public,
		created_at_utc,
		updated_at_utc,
		created_by,
		updated_by,
		description
	) SELECT 
		'd16f9bf3-1f2e-4d9d-afd7-c3de3337c02e',
		'PackageGrantSet',
		'package',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message PackageGrantSet {
			string package_id = 10;
			string package_name = 11;
			int64 organization_id = 12;
			string organization_name = 13;
			string grant_type = 14;
		}',
		'910a67c0b911c0986bddd2fd2aebc6b2f8bd4ea8a1412ec62c5ff07cd9f84596',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'veritone event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'PackageGrantSet' AND event_type = 'package' AND application_id = 'system'
	);

  INSERT INTO event_trigger.event (
		event_id,
		event_name,
		event_type,
		organization_id,
		application_id,
		schema_data,
		schema_hash,
		public,
		created_at_utc,
		updated_at_utc,
		created_by,
		updated_by,
		description
	) SELECT 
		'1bb95f28-d713-4954-b638-c0e4e07192c8',
		'PackageGrantRemoved',
		'package',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message PackageGrantRemoved {
			string package_id = 10;
			string package_name = 11;
			int64 organization_id = 12;
			string organization_name = 13;
			string grant_type = 14;
		}',
		'b4e526246e7781b93914937f42d19cea6100ef7df15c1ecd3bb6a31ce3a19ac9',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'veritone event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'PackageGrantRemoved' AND event_type = 'package' AND application_id = 'system'
	);
END;
$FLYWWAY$
