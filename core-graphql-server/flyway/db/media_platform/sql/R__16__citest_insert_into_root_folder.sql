-- citests/watchlist.js

INSERT INTO tree_object (
    tree_object_type_id,
    order_index,
    object_id,
    tree_object_id,
    creation_date,
    last_updated_date,
    tree_object_status
) VALUES (
    4,
    0,
    '22d2c53a-d33e-47d8-a77e-f64f5c3db7c8',
    '53fdfa7b-06e1-40ec-af18-f9eb67f6e6b4',
    '2016-11-05 01:48:13.18651+00',
    '2016-11-05 01:48:13.18651+00',
    1
)
ON CONFLICT DO NOTHING;

INSERT INTO root_folder (
    root_folder_id,
    root_folder_type_id,
    organization_id
) VALUES (
    '22d2c53a-d33e-47d8-a77e-f64f5c3db7c8',
    1,
    7682
)
ON CONFLICT DO NOTHING;
