
-- Create table DAG Template
CREATE TABLE IF NOT EXISTS job_new.dag_template (
   template_id UUID NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
   "name" VARCHAR(100) NOT NULL,
   "description" TEXT,
   cognitive_category_id UUID,
   mime_type varchar(60),
   dag JSONB NOT NULL DEFAULT '{}'::JSONB,
   dag_language varchar(60),
   organization_id BIGINT NOT NULL
);
COMMENT ON TABLE job_new.dag_template IS 'Table for dag templates for organization';

CREATE INDEX IF NOT EXISTS idx_dag_template ON job_new.dag_template (organization_id);


CREATE TABLE IF NOT EXISTS job_new.dag_template__organization (
   template_id UUID NOT NULL,
   organization_id BIGINT NOT NULL,
   PRIMARY KEY (template_id, organization_id)
);
COMMENT ON TABLE job_new.dag_template__organization IS 'Provides access to dag_templates across organizations';

CREATE INDEX IF NOT EXISTS idx_dag_template__organization_id ON job_new.dag_template__organization (organization_id);

