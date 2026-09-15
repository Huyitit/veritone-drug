-- VP-2581: grant the destination CRUD permissions (ids 161,162,163,164 =
--   aiware.destination.create/read/update/delete) to the current Admin Center roles.
--
-- Per R__14__remove_remaining_admin_app_roles.sql, the legacy admin-app roles are being migrated to and replaced
-- by three NEW Admin Center roles. We grant ONLY to those three new roles; the deprecated legacy roles
-- (3459c3de, 37b18322, ddca9b68) are intentionally NOT updated — they are being cleaned up/removed.
--   cb18eb9c-3264-434a-8a8d-e6b2d680f66e  = aiWARE Instance Administrator
--   032218c3-d47e-4287-9d16-7bb867c01266  = aiWARE Administrator
--   79ebbe4e-3837-4e9a-863d-8dd2d181af07  = aiWARE Finance Administrator
--
-- role.permissions is the getMaskFromPermissionIds integer[] form (verified with the id2map/map2id tools:
--   `id2map 161 162 163 164` -> 0,0,0,0,0,30 ; `map2id 0 0 0 0 0 30` -> 161,162,163,164).
-- Bit-setting is OR-distributive, so we idempotently OR dest_mask=[0,0,0,0,0,30] into each role's existing array
-- (padded to equal length). No fragile per-role current-mask guard, env-independent, safe to re-run.
DO $$
DECLARE
  dest_mask integer[] := ARRAY[0,0,0,0,0,30];
  target_roles uuid[] := ARRAY[
    'cb18eb9c-3264-434a-8a8d-e6b2d680f66e'::uuid,  -- aiWARE Instance Administrator
    '032218c3-d47e-4287-9d16-7bb867c01266'::uuid,  -- aiWARE Administrator
    '79ebbe4e-3837-4e9a-863d-8dd2d181af07'::uuid   -- aiWARE Finance Administrator
  ];
  rid    uuid;
  cur    integer[];
  merged integer[];
  i      int;
  n      int;
BEGIN
  FOREACH rid IN ARRAY target_roles LOOP
    SELECT permissions INTO cur FROM public."role" WHERE role_id = rid;
    IF cur IS NULL THEN
      RAISE NOTICE 'VP-2581 V4_23: role % not found (or NULL permissions); skipping.', rid;
      CONTINUE;
    END IF;

    merged := ARRAY[]::integer[];
    n := GREATEST(COALESCE(array_length(cur, 1), 0), array_length(dest_mask, 1));
    FOR i IN 1..n LOOP
      merged := merged || (COALESCE(cur[i], 0) | COALESCE(dest_mask[i], 0));
    END LOOP;

    UPDATE public."role" SET permissions = merged WHERE role_id = rid;
  END LOOP;
END $$;
