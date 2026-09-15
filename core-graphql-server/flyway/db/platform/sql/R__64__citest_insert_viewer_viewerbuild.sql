INSERT INTO job_new.viewer (viewer_id, owner_organization_id, name, description, icon, mimetype, viewer_type,
                            date_created, date_modified, created_by, modified_by)
VALUES ('7a369f3e-5438-496b-b9e0-ca831a426849'::uuid, 7682::integer, 'CI Test Viewer'::text, 'This viewer is used by ci tests.'::text,
        'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png'::text, 'application/json'::text,
        'external'::text, '2023-10-30 20:28:44.238228'::timestamp, '2023-10-30 20:28:44.238228'::timestamp,
        '7a369f3e-5438-496b-b9e0-ca831a426849'::uuid, '7a369f3e-5438-496b-b9e0-ca831a426849'::uuid) ON CONFLICT (viewer_id) DO NOTHING;

INSERT INTO job_new.viewer_build (viewer_build_id, viewer_id, source_url, access_url, version, status)
VALUES ('7a369f3e-5438-496b-b9e0-ca831a426849'::uuid, '7a369f3e-5438-496b-b9e0-ca831a426849'::uuid, 'https://voice2.dev.us-1.veritone.com'::text,
        'https://voice2.dev.us-1.veritone.com'::text, 2::integer, 'approved'::text) ON CONFLICT (viewer_build_id) DO NOTHING;