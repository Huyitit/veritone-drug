-- VE-25262 (fix for V4_24): V4_24 built each DMH app a role combining app access with Distribution
-- Center, but derived its perms from the app's default role -- the EMPTY "Default App Role" ({}) rather
-- than the permission-bearing "Default App Access" -- so it carried only the destination perms (ids
-- 161-164 = {0,0,0,0,0,30}; see V4_23), and it did this for every digital_media_hub_% app (incl. test
-- apps). V4_24 is applied and we do not down-migrate, so per app carrying that role this migration:
--   * TRIAL apps (application_key digital_media_hub_%, excluding test/dmhtest -- validated to match the
--     provisioned "sitename:" entity tag and the trial app icon): correct the role in place -- rename to
--     "DMH App Access & Distro Center", set perms = the app's "Default App Access" OR destination, and
--     keep it as the app default with its users. Trial users get it on claim (it is the default, added
--     on top of the shared CMS Viewer role), so this delivers Distribution Center to trial users.
--   * NON-TRIAL apps V4_24 also touched (test/dmhtest): undo the over-reach -- return V4_24's moved users
--     to "Default App Role", restore it as the app default, and demote the role (correcting/renaming it
--     where a "Default App Access" exists, else leaving it as V4_24 left it).
-- Idempotent (keyed on the old name), single transaction, no-op where the role is absent.
DO $$
DECLARE
  dest_mask     integer[] := ARRAY[0,0,0,0,0,30];             -- destination CRUD ids 161,162,163,164
  target_role   text := 'DMH Trial & Distro Center';          -- role created by V4_24 (selection key)
  new_name      text := 'DMH App Access & Distro Center';     -- corrected name
  new_desc      text := 'DMH app access plus Distribution Center (destination) create/read/update/delete.';
  access_role   text := 'Default App Access';                 -- permission-bearing source role (per app)
  old_default   text := 'Default App Role';                   -- empty default V4_24 moved users off
  system_actor  uuid := '00000000-0000-0000-0000-000000000000';
  rec           record;
  access_perms  integer[];
  merged        integer[];
  old_role_id   uuid;
  is_trial      boolean;
BEGIN
  FOR rec IN
    SELECT r.role_id, r.application_id, a.application_key
    FROM public."role" r
    JOIN public.application a ON a.application_id = r.application_id
    WHERE r.role_name = target_role
  LOOP
    -- trial apps are provisioned with key digital_media_hub_<site>; test fixtures are the test/dmhtest
    -- variants. Validated four ways (key <=> sitename entity tag <=> trial icon <=> owner org 7682).
    is_trial := rec.application_key LIKE 'digital_media_hub_%'
            AND rec.application_key NOT LIKE 'digital_media_hub_test%'
            AND rec.application_key NOT LIKE '%dmhtest%';

    -- the app's own "Default App Access" role is the source of the app-access permissions
    SELECT permissions INTO access_perms
    FROM public."role"
    WHERE application_id = rec.application_id AND role_name = access_role
    ORDER BY role_id LIMIT 1;

    -- corrected permissions = app-access perms OR destination (padded to equal length by ordinality)
    IF access_perms IS NOT NULL THEN
      SELECT ARRAY_AGG(COALESCE(s.perm, 0) | COALESCE(d.mask, 0) ORDER BY COALESCE(s.idx, d.idx))
      INTO merged
      FROM UNNEST(access_perms) WITH ORDINALITY AS s(perm, idx)
      FULL OUTER JOIN UNNEST(dest_mask) WITH ORDINALITY AS d(mask, idx)
        ON s.idx = d.idx;
    END IF;

    IF is_trial THEN
      -- Keep V4_24's structure (role is the default, users are on it); only make it correct. Without a
      -- "Default App Access" there is nothing to derive perms from, so leave the app untouched.
      IF access_perms IS NULL THEN
        CONTINUE;
      END IF;
      UPDATE public."role"
      SET role_name = new_name,
          role_description = new_desc,
          permissions = merged,
          is_default_app_role = true
      WHERE role_id = rec.role_id;
    ELSE
      -- Undo V4_24 on non-trial apps. Need the empty "Default App Role" to return users to; if it is
      -- absent we cannot undo safely, so skip.
      SELECT role_id INTO old_role_id
      FROM public."role"
      WHERE application_id = rec.application_id AND role_name = old_default
      ORDER BY role_id LIMIT 1;
      IF old_role_id IS NULL THEN
        CONTINUE;
      END IF;

      -- return V4_24's moved users (its system-actor inserts) to the default role, carrying over
      -- ur.application_id (FKs to sso_application, whose id can differ from role.application_id)
      INSERT INTO public.sso_user_role (user_id, role_id, date_created, created_by, application_id)
      SELECT ur.user_id, old_role_id, now(), system_actor, ur.application_id
      FROM public.sso_user_role ur
      WHERE ur.role_id = rec.role_id AND ur.created_by = system_actor
      ON CONFLICT (user_id, role_id, application_id) DO NOTHING;

      DELETE FROM public.sso_user_role
      WHERE role_id = rec.role_id AND created_by = system_actor;

      -- demote the role (and correct/rename it if we can derive perms). Demote must precede promoting the
      -- default below: idx_single_default_role_per_app permits only one is_default_app_role=true per app.
      IF access_perms IS NOT NULL THEN
        UPDATE public."role"
        SET role_name = new_name, role_description = new_desc, permissions = merged, is_default_app_role = false
        WHERE role_id = rec.role_id;
      ELSE
        UPDATE public."role"
        SET is_default_app_role = false
        WHERE role_id = rec.role_id AND is_default_app_role;
      END IF;

      -- restore "Default App Role" as the app default
      UPDATE public."role"
      SET is_default_app_role = true
      WHERE role_id = old_role_id AND is_default_app_role = false;
    END IF;
  END LOOP;
END $$;
