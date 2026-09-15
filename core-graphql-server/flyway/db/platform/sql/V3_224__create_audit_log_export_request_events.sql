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
		'47a9b7a8-fe76-4684-836f-01ec0c681f37',
		'CreateAuditLogExport',
		'export',
        @@{ROOT_ORG_ID}@@,
        'system',
        'message CreateAuditLogExport {
			string audit_log_export_request_id = 10;
			string requestor_id = 11;
			string created_date_time = 12;
			google.protobuf.Any filters = 13;
        }',
        '649d69367ec0b5a98a883fcf92dcf10c2f945eb8d23500776adb0ec471e88ba5',
        true,
        now(),
        now(),
        'veritone',
        'veritone',
        'veritone event'
    WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event WHERE event_name = 'CreateAuditLogExport' AND event_type = 'export' AND application_id = 'system'
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
          '9e6c8dab-96af-4e12-a1ae-ecd9fa71bf59',
          'CancelAuditLogExport',
          'export',
          @@{ROOT_ORG_ID}@@,
        'system',
        'message CancelAuditLogExport {
			string audit_log_export_request_id = 10;
			string requestor_id = 11;
			string created_date_time = 12;
        }',
        '46498965badab1995e2403df52a18a386e11a06221f0478476cb6177d4e41363',
        true,
        now(),
        now(),
        'veritone',
        'veritone',
        'veritone event'
    WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event WHERE event_name = 'CancelAuditLogExport' AND event_type = 'export' AND application_id = 'system'
        );
END;
$FLYWWAY$
