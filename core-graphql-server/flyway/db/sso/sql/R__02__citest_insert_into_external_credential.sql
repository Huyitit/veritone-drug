-- for citests/libraries.js
INSERT INTO external_credential (
    external_credential_id,
    credential_name,
    organization_id,
    created_by,
    service_type,
    credentials_ciphertext,
    encryption_key_id,
    created_date,
    updated_date
) SELECT
    '5f56e4ea-1cad-4ea4-84b6-f6b9c7a5370e',
    'core-graphql-server-citest',
    0,
    'system',
    's3',
    '8db9d4c49604b932b932952a29378b9371af2224263c1915ab47ce8c64ce2f92672d702285ec77261849802e26db57287b3c18ad257d02b449a5a2258bd1169607a1ae93c101e3fa34f547d465246a9abeacd86b5609dfadc8e2eb2f4f35f55e',
    'jun4-dev:6c9',
    1573692019,
    1573692019
WHERE NOT EXISTS (SELECT 1 FROM external_credential WHERE external_credential_id = '5f56e4ea-1cad-4ea4-84b6-f6b9c7a5370e');