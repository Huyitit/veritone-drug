ALTER TABLE job_new.flow_templates DROP COLUMN IF EXISTS flow_id;
ALTER TABLE job_new.flow_templates ADD COLUMN IF NOT EXISTS flow_id uuid PRIMARY KEY DEFAULT uuid_generate_v4();
UPDATE job_new.flow_templates SET flow_id = uuid_generate_v4();