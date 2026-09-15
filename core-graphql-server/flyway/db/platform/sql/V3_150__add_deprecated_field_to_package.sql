-- AWT-9496
ALTER TABLE aiware.package ADD COLUMN IF NOT EXISTS deprecated bool default false;