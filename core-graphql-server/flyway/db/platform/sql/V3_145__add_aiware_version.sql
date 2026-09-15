DROP TABLE IF EXISTS aiware.aiware_version CASCADE;
CREATE TABLE IF NOT EXISTS aiware.aiware_version
(
    id                      UUID NOT NULL PRIMARY KEY,
    version                 VARCHAR NOT NULL UNIQUE,
    original_manifest_url   VARCHAR NOT NULL,
    original_change_log_url VARCHAR NOT NULL,
    original_highlights_url VARCHAR NOT NULL,
    manifest_url            VARCHAR NULL,
    change_log_url          VARCHAR NULL,
    highlights_url          VARCHAR NULL,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by              VARCHAR NOT NULL,
    installed_at            TIMESTAMP WITH TIME ZONE NULL,
    installed_by            VARCHAR NULL
);
ALTER TABLE aiware.aiware_version
    OWNER TO postgres;
GRANT SELECT ON TABLE aiware.aiware_version TO readaccess;