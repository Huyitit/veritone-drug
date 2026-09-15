-- VP-2581: seed the Distribute:Ayrshare:YouTube engine row (ENGINE-1).
-- The actual worker build lives in repos/platform/engines (Go, batch-mode). This row only registers the engine.
-- Modeled on V3_275 (S3 Discovery Adapter v2). deployment_model = 2 (NonNetworkIsolated — makes outbound calls);
-- batch-mode is declared in engine_manifest.engineMode, NOT deployment_model.
--
-- engine_id is the engine's REGISTERED UUID (16568b5f-…) — the engine is registered + deployed to stage under
--   this UUID; a slug engine_id would not route the Job to it. engine_name holds the human name.
-- engine_category_id = the 'Automation' category (c5458876-…) — the engine registered under data/automation on
--   stage (core has no "distribute"/egress category). NOT V3_275's ingest-adapter category.
--   See aidlc-docs/VP-2581/construction/be/plans/be-implementation-context.md (CTX-1 + MERGE RECONCILIATION).
-- TODO(CTX-1): jwt_rights below grant task.update (required for the worker's updateTask callback) + minimal
--   reads; refine in U2/ENG once the worker's exact needs are known.
INSERT INTO job_new.engine(
  engine_id,
  engine_category_id,
  engine_name,
  engine_description,
  engine_state,
  deployment_model,
  owner_organization_id,
  is_public,
  fields,
  creates_recording,
  deleted,
  created_date,
  updated_date,
  library_required,
  icon_path,
  jwt_rights,
  use_cases,
  industries,
  engine_manifest,
  edge_version,
  distribution_type
) VALUES (
  '16568b5f-2aaa-48e6-975b-2dec5f098a29', -- registered engine UUID (engine_id IS the UUID; matches the deployed engine)
  'c5458876-43d2-41e8-a340-f734702df04a', -- 'Automation' engine_category (data/automation; not the ingest-adapter category)
  'Distribute:Ayrshare:YouTube',
  'Publishes Veritone assets to YouTube via Ayrshare. Distribute work runs as a regular aiWare Job; this engine''s worker performs the Ayrshare post and polls for status.',
  'active'::public.engine_state,
  2,
  @@{ROOT_ORG_ID}@@,
  true,
  '[]'::jsonb,
  false,
  false,
  EXTRACT(EPOCH FROM NOW())::int4,
  EXTRACT(EPOCH FROM NOW())::int4,
  false,
  '',
  '{"roles": [{"roleName": "distribute", "taskRights": ["task.update", "task_type.internal"], "assetRights": ["asset.uri", "recording.read"]}]}'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"engineMode": "batch"}'::jsonb,
  3,
  'public'::job_new.distribution_type
)
ON CONFLICT (engine_id) DO UPDATE SET
  engine_category_id = EXCLUDED.engine_category_id,
  engine_name = EXCLUDED.engine_name,
  engine_description = EXCLUDED.engine_description,
  engine_state = EXCLUDED.engine_state,
  deployment_model = EXCLUDED.deployment_model,
  is_public = EXCLUDED.is_public,
  updated_date = EXCLUDED.updated_date,
  jwt_rights = EXCLUDED.jwt_rights,
  engine_manifest = EXCLUDED.engine_manifest,
  edge_version = EXCLUDED.edge_version,
  distribution_type = EXCLUDED.distribution_type
;
