    -- Add PubPortal Admin Role's Name, Description & Permissions
    INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
    VALUES (
    'df4c0671-28c6-4186-bb38-f803d688fb9c',
    'Navigate Admin',
    'There will be some Admin on controls in terms of data stewardship',
    'veri_ads_reporting',
    '{}',
    NULL,
    FALSE
    ) ON CONFLICT (role_id) DO UPDATE
    SET permissions = '{}';
    
    -- Add PubPortal Account Manager Role's Name, Description & Permissions
    INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
    VALUES (
    '12773aea-0b96-4f6a-a16b-3ed07d4d384f',
    'Navigate Account Manager',
    'Account Manager',
    'veri_ads_reporting',
    '{}',
    NULL,
    FALSE
    ) ON CONFLICT (role_id) DO UPDATE
    SET permissions = '{}';

    -- Add PubPortal Planner Role's Name, Description & Permissions
    INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
    VALUES (
    'bfe50ede-2d60-4f84-8216-a2f84e8a5afc',
    'Navigate Planner',
    'Planner',
    'veri_ads_reporting',
    '{}',
    NULL,
    FALSE
    ) ON CONFLICT (role_id) DO UPDATE
    SET permissions = '{}';

    -- Add PubPortal Executive Role's Name, Description & Permissions
    INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
    VALUES (
    '49ee0b93-8640-4124-a6f7-3d54c95c4ade',
    'Navigate Executive',
    'Executive',
    'veri_ads_reporting',
    '{}',
    NULL,
    FALSE
    ) ON CONFLICT (role_id) DO UPDATE
    SET permissions = '{}';

    -- Add PubPortal Advertiser Role's Name, Description & Permissions
    INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
    VALUES (
    '5b8d41ff-6201-4175-b76d-2e8a9d9ddb16',
    'Navigate Advertiser',
    'Advertiser',
    'veri_ads_reporting',
    '{}',
    NULL,
    FALSE
    ) ON CONFLICT (role_id) DO UPDATE
    SET permissions = '{}';

    -- Add PubPortal Publisher Role's Name, Description & Permissions
    INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
    VALUES (
    '6a8746fc-8bf8-43b0-b83c-96c6218a2694',
    'Navigate Publisher',
    'Publisher',
    'veri_ads_reporting',
    '{}',
    NULL,
    FALSE
    ) ON CONFLICT (role_id) DO UPDATE
    SET permissions = '{}';

