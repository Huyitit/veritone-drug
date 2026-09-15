CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_package_name
    ON aiware.package (package_name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_package_distribution_type
    ON aiware.package (distribution_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_package_status
    ON aiware.package (status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_package_date_created
    ON aiware.package (date_created);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_package_date_modified
    ON aiware.package (date_modified);
