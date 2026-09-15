CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sso_user_role_userid
  ON sso_user_role (user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sso_user_role_roleid
  ON sso_user_role (role_id) WHERE user_id IS NOT NULL;

