
INSERT INTO mention_status(mention_status_id, mention_status_name)
VALUES
    (8, 'Paid'),
    (9, 'Earned'),
    (10, 'Logged Spots'),
    (11, 'Live Chatter')
ON CONFLICT DO NOTHING;
