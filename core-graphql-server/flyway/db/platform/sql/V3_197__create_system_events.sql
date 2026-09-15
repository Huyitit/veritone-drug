DO $FLYWWAY$
BEGIN

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '4e700703-9a99-49c0-b9a5-3c6ad3a1a343', 'RecordingInsertFailed', 'recording', @@{ROOT_ORG_ID}@@, 'system',
'message RecordingInsertFailed {
   string recording_id = 10;
   string error = 11;
   string fauilureType = 12;
}',
	'3f393c43f5b51a4f3fd3b48468db3d33d9ad30eec743e07b95de1d41b654fdec', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'RecordingInsertFailed' AND event_type = 'recording' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '6f420d1c-9939-4879-82e0-fb7e2226d331', 'StructuredDataCreate', 'structuredData', @@{ROOT_ORG_ID}@@, 'system',
'message StructuredDataCreate {
   string id = 10;
   string schema_id = 11;
   int64 organization_id = 12;
}',
	'dc298e0371980001f3b45803dae6959a315d1c5780bea8cf9dada736c2102b35', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'StructuredDataCreate' AND event_type = 'structuredData' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'cde16f48-2202-44a4-ac24-c260c8f46974', 'StructuredDataUpdate', 'structuredData', @@{ROOT_ORG_ID}@@, 'system',
'message StructuredDataUpdate {
   string id = 10;
   string schema_id = 11;
   int64 organization_id = 12;
}',
	'c0ec502d6cb20ce88f65953cca75729b44ee104ccddf512383c2268de16ae6e0', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'StructuredDataUpdate' AND event_type = 'structuredData' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'a9b768f6-f080-492c-a4ce-523ded824382', 'StructuredDataRegistryCreate', 'structuredData', @@{ROOT_ORG_ID}@@, 'system',
'message StructuredDataRegistryCreate {
   string id = 10;
   string name = 11;
   string data_registry_id = 12;
   int64 organization_id = 13;
   string schema = 14;
   string created_by = 15;
   google.protobuf.Any metaData = 16;
}',
	'bc6a23d00daa296e81ff9a6708104020d9ce8f3927b060644b1a3fa9fc1399c8', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'StructuredDataRegistryCreate' AND event_type = 'structuredData' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'b7f52994-8779-4830-be84-ab867bfa4764', 'StructuredDataRegistryUpdate', 'structuredData', @@{ROOT_ORG_ID}@@, 'system',
'message StructuredDataRegistryUpdate {
   string id = 10;
   string name = 11;
   string data_registry_id = 12;
   int64 organization_id = 13;
   string schema = 14;
   string created_by = 15;
   google.protobuf.Any metaData = 16;
}',
	'c5416b7d1af477699b60ffb44db5e144cda470945d67293627ffcd1454fe5b66', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'StructuredDataRegistryUpdate' AND event_type = 'structuredData' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '0ff8e201-bb0e-44b9-9b3c-7167dba361eb', 'FolderCreate', 'folder', @@{ROOT_ORG_ID}@@, 'system',
'message FolderCreate {
   string folder_id = 10;
   string folder_name = 11;
   int64 folder_type_id = 12;
   string parent_folder_id = 13;
   int64 organization_id = 14;
}',
	'a83f5bf12ab969e412b3ecdc386cccb8a98ae8b3ab7df521538bedb62b8dded2', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'FolderCreate' AND event_type = 'folder' AND application_id = 'system' );


INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'eeef7c08-6844-470c-ae65-56cf86b5a9e9', 'FolderUpdate', 'folder', @@{ROOT_ORG_ID}@@, 'system',
'message FolderUpdate {
   string folder_id = 10;
   string folder_name = 11;
   int64 folder_type_id = 12;
   string parent_folder_id = 13;
   int64 organization_id = 14;
}',
	'8b5485bef73fefc40174d8604a40dd6d1b316076cae3bd76563cf584c84ee592', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'FolderUpdate' AND event_type = 'folder' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '6e249abf-b067-4b53-818d-51a971c25482', 'FolderDelete', 'folder', @@{ROOT_ORG_ID}@@, 'system',
'message FolderDelete {
   string folder_id = 10;
   string folder_name = 11;
   int64 folder_type_id = 12;
   string parent_folder_id = 13;
   int64 organization_id = 14;
}',
	'e34783e95f6346709fbe2c05c94a63d8b639064462a46776a93f80179133f811', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'FolderDelete' AND event_type = 'folder' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '562c3790-0115-4853-a0ad-52f604bcdf52', 'MediaSourceCreate', 'media_source', @@{ROOT_ORG_ID}@@, 'system',
'message MediaSourceCreate {
   int64 media_source_id = 10;
   string media_source_name = 11;
   int64 media_source_type_id = 12;
   int64 organization_id = 13;
}',
	'8d56bae1e1b3aae587a3789a9784d0a14dd84104f1c4a64a8dc32ced3fa72c5f', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'MediaSourceCreate' AND event_type = 'media_source' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'f264dce2-cd04-46df-a6af-f7022d1db6ff', 'MediaSourceUpdate', 'media_source', @@{ROOT_ORG_ID}@@, 'system',
'message MediaSourceUpdate {
   int64 media_source_id = 10;
   string media_source_name = 11;
   int64 media_source_type_id = 12;
   int64 organization_id = 13;
}',
	'3b8d08982e6c08f64120e0ebf10d92978c199bd2757e40ccadc452a936c18877', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'MediaSourceUpdate' AND event_type = 'media_source' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'c0532e99-84bc-4728-99b4-7572077764a7', 'MediaSourceDelete', 'media_source', @@{ROOT_ORG_ID}@@, 'system',
'message MediaSourceDelete {
   int64 media_source_id = 10;
   string media_source_name = 11;
   int64 media_source_type_id = 12;
   int64 organization_id = 13;
}',
	'c0525f4207b7dd2ce6d121a90d6f512676b54e9179010dfe4ef173b57cce64f5', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'MediaSourceDelete' AND event_type = 'media_source' AND application_id = 'system' );


INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '41c21610-27d5-4201-abdc-01a470d3b9fd', 'WatchListUpdated', 'watchlist', @@{ROOT_ORG_ID}@@, 'system',
'message WatchListUpdated {
   string tracking_unit_id = 10;
   int64 organization_id = 11;
}',
	'4e6e48a7a7e94816dcbec206826463e28e8a0199cbf90657834308e912669d29', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'WatchListUpdated' AND event_type = 'watchlist' AND application_id = 'system' );


INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'f712b870-7bb1-47f7-a8bb-90bf05fd0d2e', 'UserCreate', 'user', @@{ROOT_ORG_ID}@@, 'system',
'message UserCreate {
   string user_id = 10;
   string user_name = 11;
   string status = 12;
}',
	'0efe729a2ce5e490df347209286ca815b13c71713d24529571701994a2a454b8', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'UserCreate' AND event_type = 'user' AND application_id = 'system' );


INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '3dfba004-7e23-492c-afac-1b24a5d7fff9', 'UserUpdate', 'user', @@{ROOT_ORG_ID}@@, 'system',
'message UserUpdate {
   string user_id = 10;
   string user_name = 11;
   string status = 12;
}',
	'336763d3a6160247a93a50836a2591fa5d9fb39394ada233d0c3e880d3190a7e', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'UserUpdate' AND event_type = 'user' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '59580824-0afe-4369-b81e-eb60b8e5af8c', 'UserDelete', 'user', @@{ROOT_ORG_ID}@@, 'system',
'message UserDelete {
   string user_id = 10;
   string user_name = 11;
   string status = 12;
}',
	'bc69992d56f6b721fcf263d4943b22229f2a497793914611449ef69947719150', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'UserDelete' AND event_type = 'user' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'ab401ce3-491b-471d-9b2d-31b4f67e75b8', 'OrganizationCreate', 'organization', @@{ROOT_ORG_ID}@@, 'system',
'message OrganizationCreate {
   int64 organization_id = 10;
   string organization_name = 11;
   string organization_guid = 12;
   bool is_hub_managed = 13;
}',
	'096f49497f06521027a51c4d542ab57a51cc548b8c7d2683dfb8084d3b6bec4e', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'OrganizationCreate' AND event_type = 'organization' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '7efcd37d-ef23-4a7a-ab46-d62c4afe9d44', 'OrganizationUpdate', 'organization', @@{ROOT_ORG_ID}@@, 'system',
'message OrganizationUpdate {
   int64 organization_id = 10;
   string organization_name = 11;
   string organization_guid = 12;
   bool is_hub_managed = 13;
}',
	'0fb55af0625d87c8bd77cb448123cd1b6389eb2311592a121d1522762432cfea', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'OrganizationUpdate' AND event_type = 'organization' AND application_id = 'system' );


INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '5c6f3a1b-d93d-484a-9f5b-ef9a8e3f7ac4', 'OrganizationDelete', 'organization', @@{ROOT_ORG_ID}@@, 'system',
'message OrganizationDelete {
   int64 organization_id = 10;
   string organization_name = 11;
   string organization_guid = 12;
   bool is_hub_managed = 13;
}',
	'3a314558873e1d42b4402429fc3b268548d816eaeafd1ab2958e185251dd37dc', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'OrganizationDelete' AND event_type = 'organization' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '9ee087e8-10bc-4675-9daa-5536347a2bf5', 'EngineCreate', 'engine', @@{ROOT_ORG_ID}@@, 'system',
'message EngineCreate {
   string engine_id = 10;
   string engine_name = 11;
   int32 owner_organization_id = 12;
}',
	'03c6fa6aa23ab389f1078c03d5bb3ce0a862884082bd20cd4dcf4154a34be047', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'EngineCreate' AND event_type = 'engine' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '0b4571c9-6bfe-4108-ab16-fd24689d8745', 'EngineUpdate', 'engine', @@{ROOT_ORG_ID}@@, 'system',
'message EngineUpdate {
   string engine_id = 10;
   string engine_name = 11;
   int32 owner_organization_id = 12;
}',
	'35274a01fc848aa91a6fdd2b7febabe4e482ae698653646b7c1ef8b96636c8e0', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'EngineUpdate' AND event_type = 'engine' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '76fbaeb2-6d6f-4d30-8fef-aed14b241f44', 'EngineDisable', 'engine', @@{ROOT_ORG_ID}@@, 'system',
'message EngineDisable {
   string engine_id = 10;
   string engine_name = 11;
   int32 owner_organization_id = 12;
}',
	'bd6a34a277098e3f46d9c0dc86d186abc735aca917c3682fcb1e5705dafbbdd5', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'EngineDisable' AND event_type = 'engine' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'f73833d9-bf97-4d11-8d62-c8f66dfb518f', 'EngineEnable', 'engine', @@{ROOT_ORG_ID}@@, 'system',
'message EngineEnable {
   string engine_id = 10;
   string engine_name = 11;
   int32 owner_organization_id = 12;
}',
	'92e044466c4cec97818d64359ac08c9a22a642e305d40d10946df23b3e16c8f4', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'EngineEnable' AND event_type = 'engine' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'de382e22-abca-48c8-aa4f-d053933b6c59', 'EngineBuildManifestSubmitted', 'engine', @@{ROOT_ORG_ID}@@, 'system',
'message EngineBuildManifestSubmitted {
   string user_id = 10;
   string job_id = 11;
   bool success = 12;
   string engine_id = 13;
   string build_id = 14;
}',
	'993c1e41913f9c68fbd5394bf1cc363c5bb693ccd7dce07c1b3cbac7ee79d371', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'EngineBuildManifestSubmitted' AND event_type = 'engine' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '38365f9d-57ce-4f57-9979-d24f7a2390ee', 'EngineBuildTestsRun', 'engine', @@{ROOT_ORG_ID}@@, 'system',
'message EngineBuildTestsRun {
   string user_id = 10;
   string job_id = 11;
   bool success = 12;
   string engine_id = 13;
   string build_id = 14;
}',
	'8943939b26709dd31a3770a57f1eade2f587aa8be1da9c1197935a16fae88df5', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'EngineBuildTestsRun' AND event_type = 'engine' AND application_id = 'system' );


INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'bf70e69f-822c-40d6-9ce6-6f557588d83f', 'EngineBuildDeploy', 'engine', @@{ROOT_ORG_ID}@@, 'system',
'message EngineBuildDeploy {
   string user_id = 10;
   string engine_id = 11;
   string build_id = 12;
}',
	'd1deffb6fcb42fb53b0b5cf7ef396a1a0f38aafece8ba36dd9018c9d35604c14', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'EngineBuildDeploy' AND event_type = 'engine' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '7fcf7a8c-4cf1-42a3-addd-59702c5f2a0b', 'EngineBuildSubmit', 'engine', @@{ROOT_ORG_ID}@@, 'system',
'message EngineBuildSubmit {
   string user_id = 10;
   string engine_id = 11;
   string build_id = 12;
}',
	'c9700cc07843314d196b7effdc8d6715f969b53ab3106163fd8ebbc0fb51efab', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'EngineBuildSubmit' AND event_type = 'engine' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '9b9b29f2-b912-4e46-bdd0-d718401c8106', 'EngineBuildPause', 'engine', @@{ROOT_ORG_ID}@@, 'system',
'message EngineBuildPause {
   string engine_id = 10;
   string build_id = 11;
}',
	'a44285cbd7edd21772ef7606eb5f6d3d670e6d1435ff4074fef593b4ee75ab30', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'EngineBuildPause' AND event_type = 'engine' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'e39aedf2-9a26-407c-b7a2-7e4689f20f4a', 'EngineBuildUnpause', 'engine', @@{ROOT_ORG_ID}@@, 'system',
'message EngineBuildUnpause {
   string engine_id = 10;
   string build_id = 11;
}',
	'8453382f0f33a2b246250d30bc99266a8cff18394104036a1393693a88450714', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'EngineBuildUnpause' AND event_type = 'engine' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '35ef5abb-6435-4752-96c5-36e60b7c9e59', 'EngineBuildDelete', 'engine', @@{ROOT_ORG_ID}@@, 'system',
'message EngineBuildDelete {
   string engine_id = 10;
   string build_id = 11;
}',
	'7c71356f3233cdbc10f172af9b97e03d469e701b4b9c0626b94b796b24ffadf6', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'EngineBuildDelete' AND event_type = 'engine' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '52e7c17b-e1ac-41b7-8311-972a2372e0f9', 'EngineBuildInvalidate', 'engine', @@{ROOT_ORG_ID}@@, 'system',
'message EngineBuildInvalidate {
   string engine_id = 11;
   string build_id = 12;
   int32 status_code = 13;
   string action = 14;
}',
	'f7770adc8d90e1cdb72f4dc53e2d9d7fa6f83f194a01b9aefabb136f26ebe9a2', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'EngineBuildInvalidate' AND event_type = 'engine' AND application_id = 'system' );


INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'be477940-32ab-46ab-bf30-4b71d70b73d5', 'EngineBuildCreate', 'engine', @@{ROOT_ORG_ID}@@, 'system',
'message EngineBuildCreate {
   string engine_id = 11;
   string build_id = 12;
   int32 status_code = 13;
   string action = 14;
}',
	'dd72df2c70c84c74471956178de0543ffd261da04c4f34fd571212590665f5ab', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'EngineBuildCreate' AND event_type = 'engine' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '83608502-3790-4b1e-a619-6c033594a640', 'ApplicationCreate', 'application', @@{ROOT_ORG_ID}@@, 'system',
'message ApplicationCreate {
   string application_id = 10;
   string application_name = 11;
   int64 owner_organization_id = 12;
}',
	'b689e54d2fd0d0dc09d6b3608bee5121797f9c7a84ae5847af4b2cfda061462f', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'ApplicationCreate' AND event_type = 'application' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '49e43ad8-36fd-49ec-aad1-1db335b3bc81', 'ApplicationUpdate', 'application', @@{ROOT_ORG_ID}@@, 'system',
'message ApplicationUpdate {
   string application_id = 10;
   string application_name = 11;
   string application_status = 12;
   int64 owner_organization_id = 13;
}',
	'e03643a24c41add2af25254f105e43d9b71374ece23b5924240889c1d22bd0b7', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'ApplicationUpdate' AND event_type = 'application' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'e8fc60f5-c663-4cee-98c4-8b39271dd9b8', 'ApplicationDelete', 'application', @@{ROOT_ORG_ID}@@, 'system',
'message ApplicationDelete {
   string application_id = 10;
   string application_name = 11;
   int64 owner_organization_id = 12;
}',
	'222986ded37b569c59b0bbc951cb9d04effbd64dc0b2fc3ca83ddca49af2e321', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'ApplicationDelete' AND event_type = 'application' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'f539ff42-5197-4698-9cd4-285413e02241', 'ClusterCreate', 'cluster', @@{ROOT_ORG_ID}@@, 'system',
'message ClusterCreate {
   string cluster_id = 10;
   string name = 11;
   string display_name = 12;
   int64 organization_id = 13;
   string status = 14;
}',
	'2617a55b4e099b3388f63e1806211a0e1be5cfe20815b0de309326397fd42b6e', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'ClusterCreate' AND event_type = 'cluster' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '26ee7380-353d-4f55-ad94-fe922a497d22', 'ClusterUpdate', 'cluster', @@{ROOT_ORG_ID}@@, 'system',
'message ClusterUpdate {
   string cluster_id = 10;
   string name = 11;
   string display_name = 12;
   int64 organization_id = 13;
   string status = 14;
}',
	'21c68d12d4e6b431fccaccd4f8377625a65b5e9c387208a916e6c105014afd78', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'ClusterUpdate' AND event_type = 'cluster' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT '2a4b05e9-352d-436d-adf3-e1414cdc7fa6', 'ClusterDelete', 'cluster', @@{ROOT_ORG_ID}@@, 'system',
'message ClusterDelete {
   string cluster_id = 10;
   string name = 11;
   string display_name = 12;
   int64 organization_id = 13;
   string status = 14;
}',
	'f0cfbf6d3f5090d1faa690c75bc474f002ecb67164725f22c10ac8ec7d3189b0', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'ClusterDelete' AND event_type = 'cluster' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'ecaafaed-486e-4089-8c6f-ccc30f42bc69', 'AccessMedia', 'media', @@{ROOT_ORG_ID}@@, 'system',
'message AccessMedia {
   string user_id = 10;
   string resource_type = 11;
   string resource_id = 12;
   string resource_name = 13;
}',
	'650e16bc954d0c3b721dcaf79efed62bacd3b19c83082bb1546082069515c642', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'AccessMedia' AND event_type = 'media' AND application_id = 'system' );


END;
$FLYWWAY$
