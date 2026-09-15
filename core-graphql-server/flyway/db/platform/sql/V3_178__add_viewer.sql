CREATE TABLE IF NOT EXISTS job_new.viewer (
     viewer_id                   uuid                 NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
     owner_organization_id       INT                  NOT NULL,
     name                        TEXT                 NOT NULL,
     description                 TEXT                 NULL,
     icon                        TEXT                 NULL,
     mimetype                    TEXT                 NOT NULL,
     viewer_type                 TEXT                 NOT NULL,

     date_created    TIMESTAMP DEFAULT NOW() NOT NULL,
     date_modified   TIMESTAMP DEFAULT NOW() NOT NULL,

     created_by      uuid                    NOT NULL,
     modified_by     uuid                    NOT NULL
);

COMMENT ON TABLE job_new.viewer IS 'This table contains the list of viewers, which are visual ways to consume engine output. These can be pre-built by aiWARE or developed by third parties for custom views.';
COMMENT ON COLUMN job_new.viewer.viewer_id IS 'Unique identifier for a viewer.';
COMMENT ON COLUMN job_new.viewer.owner_organization_id IS 'Organization ID that owns this viewer.';
COMMENT ON COLUMN job_new.viewer.name IS 'Name of the viewer';
COMMENT ON COLUMN job_new.viewer.description IS 'Description of the viewer';
COMMENT ON COLUMN job_new.viewer.icon IS 'URL for the icon image for the viewer';
COMMENT ON COLUMN job_new.viewer.mimetype IS 'MIME type of the viewer, specifying the type of data that the viewer can consume.';
COMMENT ON COLUMN job_new.viewer.viewer_type IS 'The type of viewer. This can be external, container, or upload.';

CREATE TABLE IF NOT EXISTS job_new.viewer_build (
    viewer_build_id           uuid                          NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
    viewer_id                 uuid                          NOT NULL,
    source_url                TEXT                          NOT NULL,
    access_url                TEXT                          NOT NULL,
    version                   INT                           NOT NULL,
    status                    TEXT                          NOT NULL,

    FOREIGN KEY (viewer_id) REFERENCES job_new.viewer(viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_viewer_mimetype ON job_new.viewer(mimetype);


COMMENT ON TABLE job_new.viewer_build IS 'This table contains builds that are associated with viewers.';
COMMENT ON COLUMN job_new.viewer_build.viewer_build_id IS 'Unique identifier for a viewer build.';
COMMENT ON COLUMN job_new.viewer_build.viewer_id IS 'Foreign key that links the build to a specific viewer from the viewer table.';
COMMENT ON COLUMN job_new.viewer_build.source_url IS 'URL for the source of the build. Depending on the build type, this could be an external URL, a container URL, or the S3 bucket where the source is stored.';
COMMENT ON COLUMN job_new.viewer_build.access_url IS 'Public URL at which the viewer build can be accessed. This is where end-users will go to consume the engine output via the viewer.';
COMMENT ON COLUMN job_new.viewer_build.version IS 'Version of the viewer build.';
COMMENT ON COLUMN job_new.viewer_build.status IS 'Status of the viewer build.';
