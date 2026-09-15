-- citests/source.js

INSERT INTO network (
    network_id,
    network_name,
    network_image
) VALUES 
    (70, 'Radio Disney', null),
    (32, 'CNN', 'https://static.veritone.com/program/cnn.png')
ON CONFLICT DO NOTHING;
