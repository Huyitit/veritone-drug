
-- Create enum type for the status column of node_red_palette
DROP TYPE IF EXISTS aiware.node_red_palette_status CASCADE; 
CREATE TYPE aiware.node_red_palette_status AS ENUM ('active', 'deleted');

-- add column status to node_red_palette with default value 'active'
ALTER TABLE aiware.node_red_palette ADD COLUMN IF NOT EXISTS status aiware.node_red_palette_status DEFAULT 'active'::aiware.node_red_palette_status NOT NULL;

-- Add a trigger to set the date_modified column when the status is updated
DROP TRIGGER IF EXISTS tr_node_red_palette_status ON aiware.node_red_palette;
CREATE TRIGGER tr_node_red_palette_status
  BEFORE UPDATE
  ON aiware.node_red_palette
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE PROCEDURE aiware.trigger_set_timestamp_date_modified_aiware_package();

