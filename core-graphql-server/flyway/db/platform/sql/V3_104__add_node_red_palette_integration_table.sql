-- AWT-6760
CREATE OR REPLACE FUNCTION aiware.trigger_set_timestamp_date_modified_aiware_package() RETURNS TRIGGER
  LANGUAGE plpgsql
AS
$$
BEGIN
  new.date_modified = NOW();
  RETURN new;
END;
$$;
ALTER FUNCTION aiware.trigger_set_timestamp_date_modified_aiware_package() OWNER TO postgres;
COMMENT ON FUNCTION aiware.trigger_set_timestamp_date_modified_aiware_package IS 'updates date_modified field';

-- Create a new table for the node modules
CREATE TABLE IF NOT EXISTS aiware.node_red_palette (
  module_id uuid NOT NULL PRIMARY KEY,
  module_repo TEXT NOT NULL,
  is_private_repo BOOLEAN DEFAULT false,
  is_private_registry BOOLEAN DEFAULT false,
  module_name TEXT NULL,
  module_version TEXT NULL,
  scope TEXT NULL,
  access_token TEXT NULL,
  registry_url TEXT NULL,
  ssh_url TEXT NULL,
  github_token TEXT NULL,
  date_created TIMESTAMP DEFAULT NOW() NOT NULL,
  date_modified TIMESTAMP DEFAULT NOW() NOT NULL,
  created_by uuid NOT NULL,
  modified_by uuid NOT NULL
);

ALTER TABLE aiware.node_red_palette OWNER TO postgres;
GRANT SELECT ON TABLE aiware.node_red_palette TO readaccess;

DROP TRIGGER IF EXISTS tr_node_red_palette ON aiware.node_red_palette;
CREATE TRIGGER tr_node_red_palette
  BEFORE UPDATE
  ON aiware.node_red_palette
  FOR EACH ROW
EXECUTE PROCEDURE aiware.trigger_set_timestamp_date_modified_aiware_package();

COMMENT ON TABLE aiware.node_red_palette IS 'This table lists all the node modules for palette integration defined in aiWARE and the owner organization';
COMMENT ON COLUMN aiware.node_red_palette.module_id IS 'ID. uuid';
COMMENT ON COLUMN aiware.node_red_palette.module_repo IS '"npm" or "github" identifying the type of repo';
COMMENT ON COLUMN aiware.node_red_palette.is_private_repo IS 'This repo is private and requires a scope and access_token to access';
COMMENT ON COLUMN aiware.node_red_palette.is_private_registry IS 'The registry this repo is hosted on is private and will require a registry_url';
COMMENT ON COLUMN aiware.node_red_palette.module_name IS 'Name of the npm module';
COMMENT ON COLUMN aiware.node_red_palette.module_version IS 'Semantic version number of the module. Optional';
COMMENT ON COLUMN aiware.node_red_palette.scope IS 'url scope segment where the private repo can be found';
COMMENT ON COLUMN aiware.node_red_palette.access_token IS 'access token for the private npm repo';
COMMENT ON COLUMN aiware.node_red_palette.registry_url IS 'full url of private npm registry including protocol';
COMMENT ON COLUMN aiware.node_red_palette.ssh_url IS 'github ssh url of repo';
COMMENT ON COLUMN aiware.node_red_palette.github_token IS 'ssh access token of github repo';
COMMENT ON COLUMN aiware.node_red_palette.date_created IS 'Date Created';
COMMENT ON COLUMN aiware.node_red_palette.date_modified IS 'Date Modified';
COMMENT ON COLUMN aiware.node_red_palette.created_by IS 'Created by';
COMMENT ON COLUMN aiware.node_red_palette.modified_by IS 'Modified by';
