-- These indexes did not exists and didn't see anywhere to create them in Flyway.
-- They are not used anymore, but see that they are existing in Stage right now, so we have to drop them if they exist.
DROP INDEX IF EXISTS _ix_unique_app_config_org_level;
DROP INDEX IF EXISTS _ix_unique_app_config_user_level;