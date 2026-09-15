CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organization_global_media ON organization (organization_id) WHERE kvp#>>'{features,globalMedia}' = 'enabled';
