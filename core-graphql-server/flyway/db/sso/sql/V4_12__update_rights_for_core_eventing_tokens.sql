-- Update all core-eventing-tokens to have the current set of permissions

UPDATE sso_token
SET "json" = jsonb_set(
  "json"::jsonb,
  '{rights}',
  '["asset:uri","master","recording:read","recording:update","asset:all",
    "task:read","task:update","job:read","job:create","task_type:internal",
    "cms:sources:read","cms:sources:update","admin.org:read","admin.group:read",
    "developer:build:read","devops:querymonitor","admin:org:update",
    "developer:build:update","developer.engine.read","developer.engine.update"]'::jsonb)::json
WHERE "json"->>'tokenLabel' = 'core-eventing-service';