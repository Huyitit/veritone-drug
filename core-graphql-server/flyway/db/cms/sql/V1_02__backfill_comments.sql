-- Flyway migration: backfill COMMENT ON statements for cms
-- Source: VP-2529 walkthrough — aidlc-docs/VP-2529/tasks/02-cms.md
-- Delivery ticket: VE-21361
-- Captured inventory: 2026-05-20 against aiw-b0031d
-- Idempotent: PostgreSQL COMMENT ON … IS '…' is upsert-by-design.

-- ============================================================
-- Tables (3)
-- ============================================================

DO $$ BEGIN COMMENT ON TABLE public.cms_user_job IS 'Bridge mapping a Veritone user (user_id uuid) to an external job id. Two-column table, no FKs declared. Schema-only as of 2026-05; not referenced by any aiware-core service.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.process_template IS 'Saved CMS process template — a named, organization-scoped pipeline of engine tasks (task_list JSON) that can be re-applied to new content. Read/written by services/api/core-graphql-server/dal/processTemplate.js via dbConnections[''cms'']. Surfaced through the GraphQL mutations createProcessTemplate/updateProcessTemplate/deleteProcessTemplate and query processTemplate(s).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON TABLE public.sharing_request IS 'Persisted share-by-link / share-to-user requests for media items. slug (uuid) is the public token presented in invite URLs; status is the sharing_request_status enum (pending/accepted/rejected/canceled). sharing_to_user and sharing_to_email are alternatives — either an internal user id or an external email address. Schema-only in aiware-core as of 2026-05; downstream consumer not located in this repo.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;

-- ============================================================
-- Columns (16)
-- ============================================================

DO $$ BEGIN COMMENT ON COLUMN public.cms_user_job.user_id IS 'Internal Veritone user uuid; PK (declared as constraint _pk_cms_user_job@user_id). One row per user.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.cms_user_job.job_id IS 'External job identifier (string). Semantics depend on the external system the user was bound to — purpose is unclear because no aiware-core code reads this table; treat as legacy until owner is identified.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.process_template.process_template_id IS 'PK; surrogate id from sequence process_template_process_template_id_seq.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.process_template.organization_id IS 'Owning organization id. All reads/writes scope by this column (see processTemplate.js:35); used as the tenant boundary for templates.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.process_template.process_template_name IS 'Human-readable template name shown in the CMS UI.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.process_template.task_list IS 'JSON pipeline definition — the list of engine tasks (and their inputs/ordering) the template applies. Stored as json, not jsonb.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sharing_request.sharing_request_id IS 'PK; surrogate id from sequence sharing_request_sharing_request_id_seq (constraint _pk_sharing_request@sharing_request_id).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sharing_request.media_id IS 'Id of the media item being shared. Note: this is an integer, not the modern TDO uuid — confirming this is part of legacy share-by-media-id flow.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sharing_request.sharing_by IS 'Uuid of the user creating the share.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sharing_request.sharing_to_user IS 'Uuid of the recipient user when sharing to a known account. Mutually exclusive with sharing_to_email.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sharing_request.sharing_to_email IS 'Email address of the recipient when sharing externally. Mutually exclusive with sharing_to_user.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sharing_request.date_created IS 'Row creation timestamp; defaults to now().'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sharing_request.date_modified IS 'Last-modified timestamp; defaults to now(). App code is expected to update on each change (no PG trigger declared).'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sharing_request.message IS 'Optional free-text note from the sender shown to the recipient.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sharing_request.status IS 'Lifecycle status, sharing_request_status enum: pending (initial, default), accepted, rejected, canceled.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN COMMENT ON COLUMN public.sharing_request.slug IS 'Public uuid token (defaults to uuid_generate_v4()) used in share URLs. Indexed by _ix_sharing_request@slug for fast token lookup.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;

-- ============================================================
-- Indexes (1)
-- ============================================================

DO $$ BEGIN COMMENT ON INDEX public."_ix_sharing_request@slug" IS 'Btree on (slug) on sharing_request; Veritone _ix_<table>@<cols> convention.'; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
