-- citests/source.js

INSERT INTO data_registry_metadata (
    id,
    name,
    description,
    source,
    org_id,
    created_by,
    created_at,
    updated_at
) VALUES (
    '0b3ddb59-3252-4251-8c22-ea833984e60b',
    'test schema',
    'a test schema',
    null,
    7682,
    '89ff041e-b246-4a2a-b8fa-a8f874a151a1',
    current_timestamp,
    current_timestamp
), (
    'e8781dbf-1187-4116-be3f-85cbfbdb150c',
    'test schema',
    'a test schema',
    null,
    7682,
    'fa7b0007-cf72-4db9-8e87-f8abaf9c0843',
    current_timestamp,
    current_timestamp
), (
    'b250a02d-b7db-4f85-8d87-b2ea0a28a528',
    'test schema',
    'a test schema',
    null,
    7682,
    '5742373a-bad4-4d82-b58f-5c870ab37765',
    current_timestamp,
    current_timestamp
), (
    'a0b7f57c-0649-4342-a8d3-e8f8a6625d73',
    'Broadcast TV Source Schema',
    'Broadcast TV Source Schema',
    'Internal',
    7682,
    'c7928c29-aa00-4f47-9073-ab7e7c885045',
    current_timestamp,
    current_timestamp
), (
    '37b6d563-17f8-42ff-9926-fc1c2fbf5a17',
    'Podcast Source Schema',
    'Podcast Source Schema',
    'Internal',
    7682,
    'c7928c29-aa00-4f47-9073-ab7e7c885045',
    current_timestamp,
    current_timestamp
), (
    '29883fd9-8da9-471a-ba23-389a625036cf',
    'Radio Source Schema',
    'Radio Source Schema',
    'Internal',
    7682,
    'c7928c29-aa00-4f47-9073-ab7e7c885045',
    current_timestamp,
    current_timestamp
), (
    '94dd82fe-635d-426b-c466-096387141563',
    'Web Stream Source Type Schema',
    'Web Stream Source Type Schema',
    'Internal',
    7682,
    'c7928c29-aa00-4f47-9073-ab7e7c885045',
    current_timestamp,
    current_timestamp
), (
    '50e69232-0b31-437f-8ddc-36ddddcb2969',
    'Mobile Device Source Type Schema',
    'Mobile Device Source Type Schema',
    'Internal',
    7682,
    'f94d1303-6abd-49a5-9d98-fb93fb22d063',
    current_timestamp,
    current_timestamp
), (
    '87d84be2-ba5f-4100-b6b9-d2235621551d',
    'Audio test Schema',
    'Audio test Schema',
    null,
    7682,
    null,
    current_timestamp,
    current_timestamp
),  (
    'a83a1687-c1e3-4c4f-a34a-156e63d03320',
    'Broadcast TV test Schema',
    'Broadcast TV test Schema',
    null,
    7682,
    null,
    current_timestamp,
    current_timestamp
)
ON CONFLICT DO NOTHING;

INSERT INTO data_registries (
    id, schema, ui_component, ttl_sec, description, org_id, created_by, modified_by, "createdAt", "updatedAt", data_registry_metadata_id, major_version, minor_version, status
) VALUES
    ('0b3ddb59-3252-4251-8c22-ea833984e60b',
     '{
        "$schema": "http://json-schema.org/draft-04/schema#"
     }',
     'test',
     30,
     'a test schema',
     7682,
     '89ff041e-b246-4a2a-b8fa-a8f874a151a1', '89ff041e-b246-4a2a-b8fa-a8f874a151a1',
     '2017-12-08 01:50:58.826', '2017-12-08 01:50:58.826',
     '0b3ddb59-3252-4251-8c22-ea833984e60b', 
     1, 0, 'inactive'),
    ('e8781dbf-1187-4116-be3f-85cbfbdb150c',
     '{
        "$schema": "http://json-schema.org/draft-04/schema#"
     }',
     'test',
     30,
     'a test schema',
     7682,
     'fa7b0007-cf72-4db9-8e87-f8abaf9c0843', 'fa7b0007-cf72-4db9-8e87-f8abaf9c0843',
     '2017-12-12 03:30:51.022', '2017-12-12 03:30:51.022',
     'e8781dbf-1187-4116-be3f-85cbfbdb150c',
     1, 0, 'inactive'),
    ('b250a02d-b7db-4f85-8d87-b2ea0a28a528',
     '{
        "$schema": "http://json-schema.org/draft-04/schema#"
     }',
     'test',
     30,
     'a test schema',
     7682,
     '5742373a-bad4-4d82-b58f-5c870ab37765', '5742373a-bad4-4d82-b58f-5c870ab37765',
     '2017-12-14 17:30:10.268', '2017-12-14 17:30:10.268',
     'b250a02d-b7db-4f85-8d87-b2ea0a28a528',
     1, 0, 'inactive'),
    ('759e5124-92d9-45f1-a153-155ab53d9271',
     '{
        "type": "object",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "properties": {
            "liveTimezone": {
                "$id": "/properties/liveTimezone",
                "type": "string",
                "title": "Live Broadcast Time Zone",
                "examples": [
                    "PST"
                ]
            },
            "stationChannel": {
                "$id": "/properties/stationChannel",
                "type": "string",
                "title": "The Station Channel",
                "examples": [
                    "1"
                ]
            },
            "stationCallSign": {
                "$id": "/properties/stationCallSign",
                "type": "string",
                "title": "The Station Call Sign",
                "examples": [
                    "ABC"
                ]
            }
        },
        "definitions": {}
     }',
     null,
     null,
     null,
     7682,
     'c7928c29-aa00-4f47-9073-ab7e7c885045', 'c7928c29-aa00-4f47-9073-ab7e7c885045',
     '2018-04-26 19:59:46.81', '2018-04-26 19:59:46.81',
     'a0b7f57c-0649-4342-a8d3-e8f8a6625d73',
     1, 0, 'draft'),
    ('6c136f9b-1bb3-4715-8df3-bb3fee50905c',
     '{
        "type": "object",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "properties": {
            "radioStreamUrl": {
                "$id": "/properties/radioStreamUrl",
                "type": "string",
                "title": "Podcast Source URL",
                "examples": []
            }
        },
        "definitions": {}
     }',
     null,
     null,
     null,
     7682,
     'c7928c29-aa00-4f47-9073-ab7e7c885045', 'c7928c29-aa00-4f47-9073-ab7e7c885045',
     '2018-04-26 19:59:46.815', '2018-04-26 19:59:46.815',
     '37b6d563-17f8-42ff-9926-fc1c2fbf5a17',
     1, 0, 'draft'),
    ('6533782d-e610-449b-ac08-19f52d082254',
     '{
        "type": "object",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "required": [
            "youtubeChannelUrl"
        ],
        "properties": {
            "youtubeChannelId": {
                "$id": "/properties/youtubeChannelId",
                "type": "string",
                "title": "YouTube Channel ID"
            },
            "youtubeChannelUrl": {
                "$id": "/properties/youtubeChannelUrl",
                "type": "string",
                "title": "YouTube Channel URL"
            }
        },
        "definitions": {}
     }',
     null,
     null,
     null,
     7682,
     'c7928c29-aa00-4f47-9073-ab7e7c885045', 'c7928c29-aa00-4f47-9073-ab7e7c885045',
     '2018-04-26 19:59:46.831', '2018-04-26 19:59:46.831',
     '7adfa472-2bad-4961-bd7d-2ec0ae8f4dab',
     1, 0, 'draft'),
    ('842e9f39-d9f3-486b-a72d-e9d8c9e3c7dc',
     '{
        "type": "object",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "properties": {
            "stationBand": {
                "$id": "/properties/stationBand",
                "type": "string",
                "title": "Radio Station Band",
                "examples": [
                    "AM"
                ]
            },
            "radioStreamUrl": {
                "$id": "/properties/radioStreamUrl",
                "type": "string",
                "title": "Radio Stream URL",
                "examples": []
            },
            "stationCallSign": {
                "$id": "/properties/stationCallSign",
                "type": "string",
                "title": "Radio Station Call Sign",
                "examples": [
                    "WKRP"
                ]
            },
            "radioStationCode": {
                "$id": "/properties/radioStationCode",
                "type": "string",
                "title": "Radio Station Code",
                "examples": []
            }
        },
        "definitions": {}
     }',
     null,
     null,
     null,
     7682,
     'c7928c29-aa00-4f47-9073-ab7e7c885045', 'c7928c29-aa00-4f47-9073-ab7e7c885045',
     '2018-04-26 19:59:46.859', '2018-04-26 19:59:46.859',
     '29883fd9-8da9-471a-ba23-389a625036cf',
     1, 0, 'draft'),
    ('2205f197-7e27-4048-94af-38d9c46a2b0a',
     '{
        "type": "object",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "properties": {
            "url": {
                "$id": "/properties/url",
                "type": "string",
                "title": "The stream URL",
                "examples": []
            }
        },
        "definitions": {}
     }',
     null,
     null,
     null,
     7682,
     'c7928c29-aa00-4f47-9073-ab7e7c885045', 'c7928c29-aa00-4f47-9073-ab7e7c885045',
     '2018-04-26 19:59:46.864', '2018-04-26 19:59:46.864',
     '94dd82fe-635d-426b-c466-096387141563',
     1, 0, 'draft'),
    ('569ac77c-bf1d-41fe-ad2e-365bb5a7c33b',
     '{
        "type": "object",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "properties": {
            "deviceId": {
                "$id": "/properties/deviceId",
                "type": "string",
                "title": "The device UUID",
                "examples": [
                    "50e69232-0b31-437f-8ddc-36ddddcb2969"
                ]
            },
            "deviceName": {
                "$id": "/properties/deviceName",
                "type": "string",
                "title": "The device name",
                "examples": [
                    "My Phone",
                    "Android Tablet #1"
                ]
            }
        },
        "definitions": {}
     }',
     null,
     null,
     null,
     7682,
     'f94d1303-6abd-49a5-9d98-fb93fb22d063', 'f94d1303-6abd-49a5-9d98-fb93fb22d063',
     '2018-04-26 20:12:34.226', '2018-04-26 20:12:34.226',
     '50e69232-0b31-437f-8ddc-36ddddcb2969',
     1, 0, 'draft'),
     ('87d84be2-ba5f-4100-b6b9-d2235621551d',
     '{
        "type": "object",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "properties": {
            "deviceId": {
                "$id": "/properties/deviceId",
                "type": "string",
                "title": "The device UUID",
                "examples": [
                    "50e69232-0b31-437f-8ddc-36ddddcb2969"
                ]
            },
            "deviceName": {
                "$id": "/properties/deviceName",
                "type": "string",
                "title": "The device name",
                "examples": [
                    "My Phone",
                    "Android Tablet #1"
                ]
            }
        },
        "definitions": {}
     }',
     null,
     null,
     null,
     7682,
     'f94d1303-6abd-49a5-9d98-fb93fb22d063', 'f94d1303-6abd-49a5-9d98-fb93fb22d063',
     '2018-04-26 20:12:34.226', '2018-04-26 20:12:34.226',
     '87d84be2-ba5f-4100-b6b9-d2235621551d',
     1, 0, 'draft'),
     ('a83a1687-c1e3-4c4f-a34a-156e63d03320',
     '{
        "type": "object",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "properties": {
            "deviceId": {
                "$id": "/properties/deviceId",
                "type": "string",
                "title": "The device UUID",
                "examples": [
                    "50e69232-0b31-437f-8ddc-36ddddcb2969"
                ]
            },
            "deviceName": {
                "$id": "/properties/deviceName",
                "type": "string",
                "title": "The device name",
                "examples": [
                    "My Phone",
                    "Android Tablet #1"
                ]
            }
        },
        "definitions": {}
     }',
     null,
     null,
     null,
     7682,
     'f94d1303-6abd-49a5-9d98-fb93fb22d063', 'f94d1303-6abd-49a5-9d98-fb93fb22d063',
     '2018-04-26 20:12:34.226', '2018-04-26 20:12:34.226',
     'a83a1687-c1e3-4c4f-a34a-156e63d03320',
     1, 0, 'draft'),
     ('dd0b9ffc-d552-4033-9990-b610b60a1920',
     '{
        "type": "object",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "properties": {
            "deviceId": {
                "$id": "/properties/deviceId",
                "type": "string",
                "title": "The device UUID",
                "examples": [
                    "50e69232-0b31-437f-8ddc-36ddddcb2969"
                ]
            },
            "deviceName": {
                "$id": "/properties/deviceName",
                "type": "string",
                "title": "The device name",
                "examples": [
                    "My Phone",
                    "Android Tablet #1"
                ]
            }
        },
        "definitions": {}
     }',
     null,
     null,
     null,
     7682,
     'f94d1303-6abd-49a5-9d98-fb93fb22d063', 'f94d1303-6abd-49a5-9d98-fb93fb22d063',
     '2018-04-26 20:12:34.226', '2018-04-26 20:12:34.226',
     '7adfa472-2bad-4961-bd7d-2ec0ae8f4dab',
     1, 0, 'draft'),
      ('f6b8d24f-be0f-4cfc-8afa-ad8eb9e3a56b',
     '{
        "type": "object",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "properties": {
            "deviceId": {
                "$id": "/properties/deviceId",
                "type": "string",
                "title": "The device UUID",
                "examples": [
                    "50e69232-0b31-437f-8ddc-36ddddcb2969"
                ]
            },
            "deviceName": {
                "$id": "/properties/deviceName",
                "type": "string",
                "title": "The device name",
                "examples": [
                    "My Phone",
                    "Android Tablet #1"
                ]
            }
        },
        "definitions": {}
     }',
     null,
     null,
     null,
     7682,
     'f94d1303-6abd-49a5-9d98-fb93fb22d063', 'f94d1303-6abd-49a5-9d98-fb93fb22d063',
     '2018-04-26 20:12:34.226', '2018-04-26 20:12:34.226',
     '37b6d563-17f8-42ff-9926-fc1c2fbf5a17',
     1, 0, 'draft')
     ON CONFLICT DO NOTHING;