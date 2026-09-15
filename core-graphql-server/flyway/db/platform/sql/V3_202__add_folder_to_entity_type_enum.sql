-- Add new entity type for folder to the entity_type enum
ALTER TYPE job_new.entity_type ADD VALUE IF NOT EXISTS 'folder';
