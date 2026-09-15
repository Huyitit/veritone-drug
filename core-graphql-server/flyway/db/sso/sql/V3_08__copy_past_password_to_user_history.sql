INSERT INTO user_history
  SELECT us.user_id, us.key, us.value FROM user_setting us
  WHERE us.key = 'pastPasswordsObject' AND us.user_id IN (SELECT user_id FROM sso_user)
ON CONFLICT DO NOTHING;