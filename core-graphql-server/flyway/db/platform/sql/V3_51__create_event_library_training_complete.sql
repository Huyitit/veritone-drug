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
)
VALUES(
	'd91096be-5f7e-4959-b25d-aaa96d260a7b',
	'LibraryTrainingComplete',
	'library',
	@@{ROOT_ORG_ID}@@,
	'system',
	'message LibraryTrainingComplete  {
		string library_id = 1;
		string library_engine_model_id = 2;
		int32 library_version = 3;
		string engine_id = 4;
		string train_job_id = 5;
		string train_status = 6;
		int64 organizationId = 7;
	}',
	'9b68f64a2defcadb2967992f46ff075048799d2083912d0b0dd4be4d26941d47',
	true,
	now(),
	now(),
	'veritone',
	'veritone',
	'veritone event'
)
ON CONFLICT DO NOTHING;