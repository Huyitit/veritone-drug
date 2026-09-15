-- Flyway migration: backfill COMMENT ON statements for structured_data
-- Source: VP-2529 walkthrough — aidlc-docs/VP-2529/tasks/07-structured_data.md
-- Delivery ticket: VE-21361
-- Captured inventory: 2026-05-20 against aiw-b0031d
-- Idempotent: PostgreSQL COMMENT ON … IS '…' is upsert-by-design.

-- ============================================================
-- Tables (18)
-- ============================================================

DO $$ BEGIN COMMENT ON TABLE audit.database_history IS 'Per-database Flyway-style audit log of every DDL/DML migration script that ran against this DB. Same shape as the audit.database_history in other Veritone DBs (sso, platform, media_platform): id PK from audit.database_history_id_seq, script_file / description / status / started_by_user, captured script_output, runtime metrics (started_date/stop_date/execution_time_ms/row_count), and errors text plus a database column for cross-DB aggregation.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.acl_sdo IS 'Instance-level RBAC grant for SDOs. Added in V1_07__add_rbac_sdo_table.sql. PK is the four-tuple (auth_group_id, permission_set_id, data_registry_id, sdo_id). A sdo_id = NULL row means the grant applies to all SDO instances of the given data_registry_id schema (a type-level grant). Specific sdo_id rows grant access to a single instance. Read by the RBAC auth layer and the reindex / OLP eventing handlers.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.data_registries IS 'Concrete SDO schema version. One row per (data_registry_metadata, version) combination. id (uuid PK) is the version identifier; schema (jsonb) is the JSON-schema body validating SDO instances; ui_component selects a UI renderer; ttl_sec controls instance retention; org_id scopes the schema to a tenant (NULL = system); data_registry_metadata_id (uuid FK with default 021b04de-… — a system metadata placeholder) links back to data_registry_metadata. major_version/minor_version track schema evolution. status enum enum_data_registries_status (default ''draft''). storage_name (varchar 255) is the **physical sdo_* table name** holding instances of this schema. indexing_flags bit varying controls which columns/indexes are created on the storage table. Soft-delete via deletedAt.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.data_registry__application IS 'Application ↔ data-registry grant: which apps can use which SDO schemas. Composite PK is (data_registry_id, application_id). created_date_time (timestamptz, defaults to UTC now) captures when the grant was made. Resolver hydration joins on this to filter the schema list per app.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.data_registry_metadata IS 'Parent metadata entry for a family of data_registries schema versions. One row per logical SDO type: id (uuid PK) referenced by data_registries.data_registry_metadata_id, name (text — the SDO type name), description (text), source (varchar 255 — origin tag, e.g. system/customer/import), org_id for tenancy, created_by/modified_by/created_at/updated_at/deleted_at audit (note: snake_case here, contrasting with data_registries'' mixedCase), is_system boolean, is_public boolean (added later).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.data_registry_property IS 'Per-(schema, property-path) descriptor. One row per JSON-schema property in a given data_registries version. Composite identity via (data_registry_metadata_id, major_version, storage_name, path). path (text) is the JSON-pointer-style location of the property inside the SDO instance (e.g. metadata.title). type (varchar 255) is the property type (string/integer/array/etc.). title (text) is the human-readable name shown in UIs. Indexed both by (drm_id, major_version) and by path for cross-schema "where is this property?" lookups.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.llm_gateway_log_buffer IS 'Transient buffer for LLM-gateway call logs. Inserted into by the LLM-gateway db-writer at request time; periodically drained by an export job (llm-gateway-topic/export-job.ts) that flushes rows to long-term storage (e.g. S3) and DELETEs them from the buffer. PK: id bigserial. gateway_call_id (text) is the upstream call identifier (UNIQUE — one row per call); log_data (text — typically JSON) is the captured request/response payload; received_at (timestamptz, default now()) is the time it was buffered.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.nielsen_tv_data IS 'Specialized SDO-like table for Nielsen TV audience data. Doesn''t follow the generic sdo_* storage convention — has its own typed columns instead of a single data jsonb. One row per (network, time-window, viewership_type, demographics) Nielsen measurement: viewership_type (varchar 255 — e.g. live_plus_same_day/live_only), unique_code (varchar 255 — Nielsen unique row code), datetime_start/datetime_end (time window), file_name (source file), program_name, demographics jsonb NOT NULL (audience-cell → AQH breakdown), is_average boolean (default false — when true, the row is an aggregate vs a primary measurement), network_code (varchar 10 — broadcast network code). FK data_registry_id ties to the schema that types these rows.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.sdo_discovery_1_o_5_x_1_wnhvbr IS 'SDO instance storage table for the "Discovery 1.o.5.x.1" schema family (random suffix wnhvbr). Storage backing for the corresponding data_registries row. See shared SDO schema note above.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;

-- ============================================================
-- Columns (171)
-- ============================================================

DO $$ BEGIN COMMENT ON COLUMN audit.database_history.id IS 'Surrogate PK from sequence audit.database_history_id_seq.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.script_file IS 'Filename of the migration script.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.description IS 'Human-readable description of what the migration did.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.status IS 'Run status: success / failed / running.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.started_by_user IS 'PG user / role that initiated the migration.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.script_output IS 'Captured stdout/stderr from the migration.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.started_date IS 'When the migration began.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.stop_date IS 'When the migration ended.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.execution_time_ms IS 'Elapsed wall-clock ms.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.row_count IS 'Reported affected-row count.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.errors IS 'Error message body.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.database IS 'DB name the migration applied to.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.acl_sdo.sdo_id IS 'Instance id when the grant is scoped to a single SDO. NULL = grant applies to all SDOs of the type. PK part 4.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.acl_sdo.data_registry_id IS 'FK → data_registries.id; the SDO schema this grant applies to. PK part 3.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.acl_sdo.auth_group_id IS 'FK → sso.public.rbac_auth_group; the recipient group. PK part 1.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.acl_sdo.permission_set_id IS 'FK → permission set; the granted permissions. PK part 2.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.id IS 'PK; uuid identifier of this schema version.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.schema IS 'JSON-schema body validating SDO instances.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.ui_component IS 'UI-renderer selector for instances of this schema.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.ttl_sec IS 'Retention TTL in seconds; NULL = no expiration.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.description IS 'Free-text description shown in admin UIs.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.org_id IS 'Owning organization id; NULL = system-level schema.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.created_by IS 'Creator user id (text — historical width).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.modified_by IS 'Last-modifier user id.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries."createdAt" IS 'Column createdAt; see aidlc-docs/VP-2529 for context.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries."updatedAt" IS 'Column updatedAt; see aidlc-docs/VP-2529 for context.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries."deletedAt" IS 'Column deletedAt; see aidlc-docs/VP-2529 for context.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.data_registry_metadata_id IS 'FK → data_registry_metadata.id. The default uuid is a system "unknown metadata" placeholder.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.major_version IS 'Major schema version (breaking changes increment this).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.minor_version IS 'Minor schema version (backward-compatible additions).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.status IS 'Lifecycle enum (draft/active/deprecated/etc.).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.storage_name IS 'Physical PG table name holding instances of this schema (e.g. sdo_veritone_t_1_5_nr_3_r_4923_q).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registries.indexing_flags IS 'Bitmask controlling which optional indexes are created on the storage table.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry__application.data_registry_id IS 'FK → data_registries.id. PK part 1.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry__application.application_id IS 'FK → sso.public.application.application_id. PK part 2.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry__application.created_date_time IS 'When the grant was created.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_metadata.id IS 'PK; uuid identifier of the metadata entry.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_metadata.name IS 'SDO type name.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_metadata.description IS 'Free-text description.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_metadata.source IS 'Origin tag (e.g. system, customer, import).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_metadata.org_id IS 'Owning organization id; NULL = system metadata.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_metadata.created_by IS 'Creator user id.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_metadata.modified_by IS 'Last-modifier user id.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_metadata.created_at IS 'Row creation time (snake_case here).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_metadata.updated_at IS 'Row last-modified time.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_metadata.deleted_at IS 'Soft-delete marker. NULL = live.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_metadata.is_system IS 'When true, indicates a built-in / system-managed metadata entry that should not be edited by users.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_metadata.is_public IS 'When true, the metadata is visible cross-tenant.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_property.data_registry_metadata_id IS 'FK → data_registry_metadata.id.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_property.major_version IS 'Schema major version this property belongs to.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_property.storage_name IS 'Physical sdo_* table name (denormalized from data_registries.storage_name).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_property.path IS 'JSON-pointer-style property location inside the SDO instance (e.g. metadata.title).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_property.type IS 'Property type (string/integer/array/...).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.data_registry_property.title IS 'Human-readable name for the property.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.llm_gateway_log_buffer.id IS 'Auto-increment PK.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.llm_gateway_log_buffer.gateway_call_id IS 'Upstream LLM-gateway call identifier; UNIQUE-indexed so duplicate logs are rejected at write time.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.llm_gateway_log_buffer.log_data IS 'Captured payload (typically JSON-stringified request + response). May contain user prompts — handle as PII.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.llm_gateway_log_buffer.received_at IS 'When the row was buffered; used by the export job to pick the time-range to flush.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.id IS 'PK; uuid identifier.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.decorators IS 'Optional decorator payload added by the import pipeline (provenance, dedup hints).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.data_registry_id IS 'FK → data_registries.id; the Nielsen TV-data schema version.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.viewership_type IS 'Nielsen viewership type (e.g. live_plus_same_day, live_only).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.unique_code IS 'Nielsen-assigned unique row code for dedup.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.datetime_start IS 'Window start.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.datetime_end IS 'Window end.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.file_name IS 'Source file the row was loaded from.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.program_name IS 'TV program / show name.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.demographics IS 'Audience demographic cell → AQH breakdown (gender × age × etc.).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.modified_by IS 'Last-modifier user id.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.created_by IS 'Creator user id.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data."createdAt" IS 'Column createdAt; see aidlc-docs/VP-2529 for context.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data."updatedAt" IS 'Column updatedAt; see aidlc-docs/VP-2529 for context.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.is_average IS 'When true, the row is an aggregate / averaged measurement (vs a primary individual measurement).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.nielsen_tv_data.network_code IS 'Broadcast network code (e.g. ABC, NBC, CBS).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sdo_discovery_1_o_5_x_1_wnhvbr.id IS 'Primary surrogate key.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sdo_discovery_1_o_5_x_1_wnhvbr.data_registry_id IS 'Foreign-key reference to data_registry.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sdo_discovery_1_o_5_x_1_wnhvbr.data IS 'Column data; see aidlc-docs/VP-2529 for context.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sdo_discovery_1_o_5_x_1_wnhvbr.created_by IS 'Column created_by; see aidlc-docs/VP-2529 for context.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sdo_discovery_1_o_5_x_1_wnhvbr.modified_by IS 'Column modified_by; see aidlc-docs/VP-2529 for context.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sdo_discovery_1_o_5_x_1_wnhvbr.organization_id IS 'Foreign-key reference to organization.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sdo_discovery_1_o_5_x_1_wnhvbr.application_id IS 'Foreign-key reference to application.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sdo_discovery_1_o_5_x_1_wnhvbr.dataset_id IS 'Foreign-key reference to dataset.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sdo_discovery_1_o_5_x_1_wnhvbr."createdAt" IS 'Column createdAt; see aidlc-docs/VP-2529 for context.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sdo_discovery_1_o_5_x_1_wnhvbr."updatedAt" IS 'Column updatedAt; see aidlc-docs/VP-2529 for context.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;

-- ============================================================
-- Indexes (52)
-- ============================================================

DO $$ BEGIN COMMENT ON INDEX audit.ix_database_history_started_date IS 'Btree on (started_date) for time-range forensic queries.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX audit.ix_database_history_status IS 'Btree on (status) for quick lookups of failed / in-progress runs.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public."_ix_data_registry__application@application_id" IS 'Btree on (application_id). Supports "what schemas does this app have access to?".'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public."_ix_data_registry__application@data_registry_id" IS 'Btree on (data_registry_id). Supports "what apps can use this schema?".'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public."_ix_data_registry_metadata@drm_id,major_version" IS 'Btree on (data_registry_metadata_id, major_version). Supports "all properties for schema version X".'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public."_ix_data_registry_metadata@path" IS 'Btree on (path). Supports cross-schema "where is property X used?" lookups.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public."_pk_data_registry__application@data_registry_id,application_id" IS 'PK-backing unique index on (data_registry_id, application_id).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.acl_sdo_null_sdo_unique IS 'Partial unique index on type-level rows (sdo_id IS NULL). Enforces at most one type-level grant per (auth_group, permission_set, data_registry).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.acl_sdo_unique IS 'Unique index on the full PK shape (auth_group_id, permission_set_id, data_registry_id, sdo_id) — backs the PK.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.idx_data_registries__drmid IS 'Btree on (data_registry_metadata_id). Supports "all versions of this metadata" lookup.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.llm_gateway_log_buffer_gateway_call_id_idx IS 'UNIQUE btree on (gateway_call_id). Enforces no duplicate logs per upstream call id.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.llm_gateway_log_buffer_received_at_idx IS 'Btree on (received_at). Supports the export job''s time-range scan.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.nielsen_tv_data_data_registry_id IS 'Btree on (data_registry_id). Schema-scoped filter.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.nielsen_tv_data_datetime_end IS 'Btree on (datetime_end). Time-window queries.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.nielsen_tv_data_datetime_end_index IS 'Likely duplicate of nielsen_tv_data_datetime_end (different name same column) — check for cleanup opportunity.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.nielsen_tv_data_datetime_start IS 'Btree on (datetime_start). Time-window queries.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.nielsen_tv_data_file_name IS 'Btree on (file_name). Source-file-scoped reads (e.g. reprocess all rows from file X).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.nielsen_tv_data_is_average_index IS 'Btree on (is_average). Filter primary measurements vs aggregates.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.nielsen_tv_data_network_code_index IS 'Btree on (network_code). Network-scoped queries.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.nielsen_tv_data_unique_code IS 'Btree on (unique_code). Nielsen unique-row lookup.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.nielsen_tv_data_unique_code_datetime_start_viewership_type IS 'Composite btree on (unique_code, datetime_start, viewership_type). Backs the natural-key dedup query.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.nielsen_tv_data_viewership_type IS 'Btree on (viewership_type). Type-scoped filter.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.sdo_discovery_1_o_5_x_1_wnhvbr_created_at IS 'Btree on (createdAt). Time-range queries.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.sdo_discovery_1_o_5_x_1_wnhvbr_data_registry_id IS 'Btree on (data_registry_id). Schema-version filter (typically all rows have same value but useful when multiple versions co-exist).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.sdo_discovery_1_o_5_x_1_wnhvbr_organization_id IS 'Btree on (organization_id). Tenant scoping.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
