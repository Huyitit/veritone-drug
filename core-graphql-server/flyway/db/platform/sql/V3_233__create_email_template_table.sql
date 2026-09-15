CREATE TABLE IF NOT EXISTS aiware.email_template (
    email_template_id     VARCHAR NOT NULL,
    organization_guid     UUID NULL,
    code                  JSONB NULL,
    lang                  VARCHAR(255) NOT NULL,
    default_args          JSONB NULL,
    default_from_name     VARCHAR(255) NOT NULL,
    default_subject       VARCHAR(255) NOT NULL,
    created_date          TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_date          TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_by            VARCHAR(255) NULL,
    CONSTRAINT email_template_unique UNIQUE (email_template_id, organization_guid)
);