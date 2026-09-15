-- Doc: https://docs.google.com/spreadsheets/d/1zJiNn9aItu6N0cjyWUxkYtC6Iv-eP45n-5w-U29EhNA/edit#gid=0

-- Should we drop? Not sure someone is using
-- DROP TABLE IF EXISTS retention_media_log;
-- DROP TABLE IF EXISTS qd_pc_media_metadata;

-- subscription.public.digest is not an aiware table

ALTER TABLE IF EXISTS media_metadata
    ADD COLUMN IF NOT EXISTS modified_date_time TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- use data created
-- ALTER TABLE share
--     ADD COLUMN IF NOT EXISTS modified_date_time TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE IF EXISTS tree_object_closure
    ADD COLUMN IF NOT EXISTS modified_date_time TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
