UPDATE organization
SET kvp = (
    SELECT jsonb_set(
        kvp::jsonb,       
        '{features, enableRBACFeatureForSDO}',
        '"disabled"',
        TRUE
    )
)::json                                             
WHERE
    kvp -> 'features' ->> 'enableRBACFeatureForSDO' = 'enabled'
    AND
    kvp -> 'features' ->> 'enableRBACFeature' = 'disabled';