-- VE-25262: make a new self-contained role the DEFAULT for every DMH trial app so a trial user's
-- single role grants both the DMH permissions and Distribution Center (the `destination` resource,
-- CRUD ids 161,162,163,164 = bitmask {0,0,0,0,0,30}; see V4_23). This removes the dependency on the
-- broad aiWARE admin roles for Distribution Center. DMH trial apps are provisioned individually with
-- key digital_media_hub_<suffix>, so we select them dynamically and scope per app. Idempotent
-- (guarded by role_name), single transaction, and a no-op where no DMH trial apps exist (dev/stage).
-- NOTE: the Automate provisioning flow must set this role as the default for apps/orgs created after
-- this runs — that is outside this migration. See PR/commit for the full rationale.
DO $$
DECLARE
  dest_mask     integer[] := ARRAY[0,0,0,0,0,30];             -- destination CRUD ids 161,162,163,164
  new_role_name text := 'DMH Trial & Distro Center';
  new_role_desc text := 'Default DMH trial role: DMH permissions plus Distribution Center (destination) create/read/update/delete.';
  system_actor  uuid := '00000000-0000-0000-0000-000000000000';
  aid    uuid;
  src    public."role"%ROWTYPE;
  new_id uuid;
  merged integer[];
BEGIN
  FOR aid IN
    SELECT application_id
    FROM public.application
    WHERE application_key LIKE 'digital_media_hub_%'
      AND application_key NOT LIKE 'digital_media_hub_test%'   -- exclude the test DMH apps
  LOOP
    -- idempotent: skip apps already migrated
    IF EXISTS (
      SELECT 1 FROM public."role" WHERE application_id = aid AND role_name = new_role_name
    ) THEN
      CONTINUE;
    END IF;

    -- the app's current default role is the source of the DMH permissions
    SELECT * INTO src
    FROM public."role"
    WHERE application_id = aid AND is_default_app_role = true
    ORDER BY role_id
    LIMIT 1;

    -- app has no default role; nothing to derive from, skip it
    IF src.role_id IS NULL THEN
      CONTINUE;
    END IF;

    -- new permissions = current default role's permissions OR destination (padded to equal length)
    SELECT ARRAY_AGG(COALESCE(s.perm, 0) | COALESCE(d.mask, 0) ORDER BY COALESCE(s.idx, d.idx))
    INTO merged
    FROM UNNEST(src.permissions) WITH ORDINALITY AS s(perm, idx)
    FULL OUTER JOIN UNNEST(dest_mask) WITH ORDINALITY AS d(mask, idx)
      ON s.idx = d.idx;

    -- 1. demote the previous default FIRST. idx_single_default_role_per_app (V3_102) is a partial
    --    UNIQUE (application_id, is_default_app_role) WHERE is_default_app_role, enforced immediately,
    --    so there must be zero true-defaults for this app before we insert the new default row.
    UPDATE public."role" SET is_default_app_role = false WHERE role_id = src.role_id;

    -- 2. create the new role AS the app default, inheriting the source role's app/org attributes
    new_id := gen_random_uuid();
    INSERT INTO public."role" (
      role_id, role_name, role_description, permissions,
      organization_id, is_private, is_app_event_role, application_id, is_default_app_role
    ) VALUES (
      new_id, new_role_name, new_role_desc, merged,
      src.organization_id, src.is_private, src.is_app_event_role, aid, true
    );

    -- 3. backfill existing active trial users onto the new role (replace: add new, drop old)
    INSERT INTO public.sso_user_role (user_id, role_id, date_created, created_by, application_id)
    SELECT ur.user_id, new_id, now(), system_actor, ur.application_id
    FROM public.sso_user_role ur
    WHERE ur.role_id = src.role_id
    ON CONFLICT (user_id, role_id, application_id) DO NOTHING;

    DELETE FROM public.sso_user_role ur WHERE ur.role_id = src.role_id;
  END LOOP;
END $$;
