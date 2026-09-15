DROP TABLE IF EXISTS aiware.aiware_version_history CASCADE;
CREATE TABLE IF NOT EXISTS aiware.aiware_version_history
(
    history_id              UUID NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_id              UUID NOT NULL,
    installed_at            TIMESTAMP WITH TIME ZONE NOT NULL,
    installed_by            VARCHAR NOT NULL,
    -- when the history record was created, i.e., not related to the version creation date
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_version_installed UNIQUE (version_id, installed_at)
);
ALTER TABLE aiware.aiware_version_history
    OWNER TO postgres;
GRANT SELECT ON TABLE aiware.aiware_version_history TO readaccess;

-- if any versions already exist, capture what we can
INSERT INTO 
    aiware.aiware_version_history(
        version_id,
        installed_at,
        installed_by
    )
SELECT
    id,
    installed_at,
    installed_by
FROM
	aiware.aiware_version
WHERE
    installed_at IS NOT NULL
ORDER BY
    installed_at ASC
ON CONFLICT DO NOTHING;