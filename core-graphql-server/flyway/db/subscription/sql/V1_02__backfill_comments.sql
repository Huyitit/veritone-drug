-- Flyway migration: backfill COMMENT ON statements for subscription
-- Source: VP-2529 walkthrough — aidlc-docs/VP-2529/tasks/08-subscription.md
-- Delivery ticket: VE-21361
-- Captured inventory: 2026-05-20 against aiw-b0031d
-- Idempotent: PostgreSQL COMMENT ON … IS '…' is upsert-by-design.

-- ============================================================
-- Tables (5)
-- ============================================================

DO $$ BEGIN COMMENT ON TABLE audit.database_history IS 'Per-database Flyway-style audit log of every DDL/DML migration script that ran against this DB. Same shape as the audit.database_history in other Veritone DBs (sso, platform, media_platform, structured_data): id PK from audit.database_history_id_seq, script_file / description / status / started_by_user, captured script_output, runtime metrics (started_date / stop_date / execution_time_ms / row_count), and errors text plus a database column for cross-DB aggregation. Populated by the DBA / migration-runner tooling outside this repo.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.digest IS 'One row per **digest delivery event** for a subscription — the audit trail of "we sent this digest at this time to this subscription". digest_id (integer PK from digest_digest_id_seq), subscription_id (integer FK → subscription.subscription_id), date_created (timestamp UTC, default timezone(''UTC'', now())), message (json — the rendered digest body that was delivered). Inserted by the subscription / notification service when it sends a digest; not pruned automatically (kept for replay / audit).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.frequency IS 'Lookup table mapping a delivery-frequency id to a human-readable name (e.g. daily, weekly, monthly, immediate). Two columns only: frequency_id (integer PK), frequency_name (text NOT NULL). Seeded via R__2__insert_frequency.sql repeatable migration so the lookup values can be re-applied / updated by re-running the repeatable. Referenced by subscription.frequency_id.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.object_type IS 'Lookup table mapping a subscribable object-type id to a name. Two columns: object_type_id (integer PK), object_type_name (text NOT NULL — e.g. mention, watchlist, program, recording). Seeded via R__1__insert_into_object_type.sql repeatable migration. Referenced by subscription.object_type_id. Decoupling object-type as a lookup (vs an enum) lets new types be added without a schema migration.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.subscription IS 'The core subscription definition: one row per "user X wants notifications about object-type Y at frequency Z". Carries identity (subscription_id PK from sequence, organization_id integer, user_id uuid), delivery channels (email_address, mobile_number, web_hook_url — at least one expected to be non-null), classification (object_type_id FK → object_type, frequency_id FK → frequency), payload (subscription_data json — filter criteria / saved-search definition / formatting options), lifecycle (is_active bool default true, date_created / date_modified defaulting to UTC now()), scheduling (scheduled_time time + scheduled_time_zone text, scheduled_day integer — day-of-week or day-of-month per frequency, next_send_date timestamp), and application_id (text, default ''10abcbcf-59bc-4054-9f56-9b3baf3f0935'' — a system default application uuid). The expression index subscription_organization_id_expr_idx likely indexes (organization_id, …) for org-scoped scans.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;

-- ============================================================
-- Columns (37)
-- ============================================================

DO $$ BEGIN COMMENT ON COLUMN audit.database_history.id IS 'Surrogate PK from sequence audit.database_history_id_seq.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.script_file IS 'Filename of the migration script (e.g. V1_01__create_database….sql).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.description IS 'Human-readable description of what the migration did.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.status IS 'Run status: success / failed / running.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.started_by_user IS 'PG user / role that initiated the migration.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.script_output IS 'Captured stdout/stderr from the migration run.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.started_date IS 'When the migration began.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.stop_date IS 'When the migration ended (NULL while still running).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.execution_time_ms IS 'Elapsed wall-clock ms.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.row_count IS 'Reported affected-row count.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.errors IS 'Error message body when status != success.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN audit.database_history.database IS 'DB name the migration applied to.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.digest.digest_id IS 'PK from sequence digest_digest_id_seq.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.digest.subscription_id IS 'FK → subscription.subscription_id; the subscription this digest was sent for.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.digest.date_created IS 'When the digest was generated and sent (UTC).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.digest.message IS 'Rendered digest payload that was delivered. May contain user-targeted content (mention summaries, link previews) — handle as user-scoped data when surfacing.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.frequency.frequency_id IS 'PK; integer frequency id referenced by subscription.frequency_id.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.frequency.frequency_name IS 'Human-readable frequency name (e.g. daily, weekly, monthly, immediate).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.object_type.object_type_id IS 'PK; integer object-type id referenced by subscription.object_type_id.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.object_type.object_type_name IS 'Human-readable object-type name (e.g. mention, watchlist, program, recording).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.subscription_id IS 'PK from subscription_subscription_id_seq.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.organization_id IS 'Owning tenant. Scoped index subscription_organization_id_expr_idx supports org-scoped enumeration.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.user_id IS 'Subscribing user.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.email_address IS 'Email delivery target. NULL = no email delivery (must have mobile_number or web_hook_url). PII.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.mobile_number IS 'SMS delivery target. NULL = no SMS delivery. PII.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.web_hook_url IS 'Webhook delivery target (POST destination). NULL = no webhook delivery.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.object_type_id IS 'FK → object_type.object_type_id; what kind of object the subscription is about.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.frequency_id IS 'FK → frequency.frequency_id; how often digests are sent.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.subscription_data IS 'Filter criteria / saved-search definition / formatting options. Schema depends on object_type_id.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.is_active IS 'Soft-disable flag. When false, the scheduler skips this subscription without deleting the row.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.date_created IS 'Row creation time (UTC).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.date_modified IS 'Last-modified time (UTC). App-managed (no PG trigger).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.scheduled_time IS 'Local-clock time-of-day delivery target (e.g. 09:00:00). Interpreted in scheduled_time_zone.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.scheduled_time_zone IS 'IANA tz name for scheduled_time (e.g. America/Los_Angeles).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.application_id IS 'Application that owns the subscription. Default uuid is a system / "default app" placeholder.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.next_send_date IS 'Computed time of the next planned send. NULL = no upcoming send (paused or terminal).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.subscription.scheduled_day IS 'Day selector — interpretation depends on frequency_id (day-of-week 0-6 for weekly, day-of-month 1-31 for monthly).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;

-- ============================================================
-- Indexes (3)
-- ============================================================

DO $$ BEGIN COMMENT ON INDEX audit.ix_database_history_started_date IS 'Btree on (started_date). Time-range forensic queries.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX audit.ix_database_history_status IS 'Btree on (status). Quick lookups of failed / in-progress runs.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON INDEX public.subscription_organization_id_expr_idx IS 'Expression index keyed on organization_id (and likely additional expression terms). Supports org-scoped subscription enumeration when the scheduler walks the table to find due sends.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
