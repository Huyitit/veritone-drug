CREATE INDEX IF NOT EXISTS idx_tree_object_closure_parent_depth
    ON tree_object_closure (parent_tree_object_id, depth);

COMMENT ON INDEX idx_tree_object_closure_parent_depth IS 'For folder queries by parent object id and depth'