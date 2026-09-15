-- citests/source.js

INSERT INTO network (
    network_id,
    network_name,
    network_image
) VALUES (
    39,
    'Syfy',
    'http://www.veer.com/more/media/24434/syfymotion.png'
)
ON CONFLICT DO NOTHING;
