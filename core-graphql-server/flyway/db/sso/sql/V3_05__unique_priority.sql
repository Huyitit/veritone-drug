CREATE UNIQUE INDEX IF NOT EXISTS _ix_uniqe_priority_per_user
  ON public.sso_user__sso_group (user_id, priority);

create or replace function next_priority(p_user_id uuid)
  returns smallint
as
  'select coalesce(max(priority), -1::smallint) + 1::smallint
  from sso_user__sso_group
  where user_id = p_user_id;'
language sql;

create or replace function min_priority(p_user_id uuid)
  returns smallint
as
  'select min(priority)
  from sso_user__sso_group
  where user_id = p_user_id;'
language sql;
