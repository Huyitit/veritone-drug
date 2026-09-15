DROP TABLE IF EXISTS aiware.platform_info CASCADE;
CREATE TABLE IF NOT EXISTS aiware.platform_info
(
    json_properties     JSONB NOT NULL,
    modified_by         VARCHAR NOT NULL ,
    modified_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE aiware.platform_info
    OWNER TO postgres;
GRANT SELECT ON TABLE aiware.platform_info TO readaccess;

INSERT INTO
        aiware.platform_info(
                json_properties,
                modified_by,
                modified_at
        )
VALUES(
        '{"Environment": "US West", "Cluster Size": "Small"}',
        'System',
        NOW()
);