-- citests/watchlist.js

INSERT INTO tracking_unit_state_lookup (
    tracking_unit_state_lookup_id,
    tracking_unit_state_lookup_name
) VALUES (
    4,
    'INACTIVE'
)
ON CONFLICT DO NOTHING;
