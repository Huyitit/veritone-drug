drop index if exists _ix_uniqe_priority_per_user;

CREATE UNIQUE INDEX IF NOT EXISTS _ix_uniqe_priority_per_user_group
  ON public.sso_user__sso_group (user_id, group_id, priority);
