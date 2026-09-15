DROP TYPE IF EXISTS job_new.entity_type CASCADE;
CREATE TYPE job_new.entity_type AS ENUM ('engine','schema','events', 'cluster', 'flow', 'app');

CREATE TABLE IF NOT EXISTS job_new.entity_tags
(
    tag_key         TEXT                    NOT NULL,
    tag_value       TEXT                    NULL,
    organization_id INT                     NOT NULL,
    entity_type     job_new.entity_type     NOT NULL,
    entity_id       uuid                    NOT NULL,

   -- basic accounting
    date_created    TIMESTAMP DEFAULT NOW() NOT NULL,
    date_modified   TIMESTAMP DEFAULT NOW() NOT NULL,

    created_by      uuid                    NOT NULL,
    modified_by     uuid                    NOT NULL,

    CONSTRAINT pk_entity_tag
        PRIMARY KEY (organization_id, entity_type, entity_id, tag_key)
);


ALTER TABLE job_new.entity_tags OWNER TO postgres;

COMMENT ON TABLE job_new.entity_tags IS 'Table for entity and tags relationship';
COMMENT ON COLUMN job_new.entity_tags.tag_key IS 'text value for the key/name of a tag.  this must be lowercase';
COMMENT ON COLUMN job_new.entity_tags.tag_value IS 'text value of the value associated with a ke. This can be NULL if the key does not have a value';
COMMENT ON COLUMN job_new.entity_tags.organization_id IS 'Organization this group belongs to';
COMMENT ON COLUMN job_new.entity_tags.entity_type IS 'The entity type';
COMMENT ON COLUMN job_new.entity_tags.entity_id IS 'The id associated with the entity (engine, app, etc)';

CREATE INDEX IF NOT EXISTS idx_entity_tags_pattern ON job_new.entity_tags
    (organization_id, entity_type, LOWER(tag_key) text_pattern_ops);

CREATE OR REPLACE FUNCTION job_new.trigger_set_date_modified_lowercase_tag_key_entity_tag() RETURNS TRIGGER
    LANGUAGE plpgsql
AS
$$
BEGIN
    new.date_modified = DATE_PART('epoch'::TEXT, NOW());
    new.tag_key = LOWER(new.tag_key);

    RETURN new;
END;
$$;
ALTER FUNCTION job_new.trigger_set_date_modified_lowercase_tag_key_entity_tag() OWNER TO postgres;

CREATE TRIGGER tr_entity_tags
    BEFORE UPDATE
    ON job_new.entity_tags
    FOR EACH ROW
EXECUTE PROCEDURE job_new.trigger_set_date_modified_lowercase_tag_key_entity_tag();
