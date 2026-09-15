-- Doc: https://docs.google.com/spreadsheets/d/1zJiNn9aItu6N0cjyWUxkYtC6Iv-eP45n-5w-U29EhNA/edit#gid=0

ALTER TABLE job_new.engine_category
    ADD COLUMN IF NOT EXISTS modified_date_time TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE job_new.scheduled_job__job_template 
    ADD COLUMN IF NOT EXISTS modified_date_time TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE job_new.organization__engine 
    ADD COLUMN IF NOT EXISTS modified_date_time TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE recording.recording__source 
    ADD COLUMN IF NOT EXISTS modified_date_time TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
