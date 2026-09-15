INSERT INTO job_new.viewer (viewer_id, owner_organization_id, name, description, icon, mimetype, viewer_type,
                            date_created, date_modified, created_by, modified_by)
VALUES ('3e3577d0-5e3b-4756-8eaa-d2d178374d1a'::uuid, @@{ROOT_ORG_ID}@@::integer, 'JSON Viewer'::text, 'Basic JSON Viewer Application to view JSON output.'::text,
        ''::text, 'application/json'::text, 'external'::text, '2023-11-29 20:28:44.238228'::timestamp, '2023-11-29 20:28:44.238228'::timestamp,
        '7a369f3e-5438-496b-b9e0-ca831a426849'::uuid, '7a369f3e-5438-496b-b9e0-ca831a426849'::uuid) ON CONFLICT (viewer_id) DO NOTHING;

INSERT INTO job_new.viewer_build (viewer_build_id, viewer_id, source_url, access_url, version, status)
VALUES ('01a2ad40-df0d-4fad-bfe8-fbcc10b88beb'::uuid, '3e3577d0-5e3b-4756-8eaa-d2d178374d1a'::uuid, 'https://viewers.@@EXTERNAL_DNS_ZONE@@/json'::text,
        'https://viewers.@@EXTERNAL_DNS_ZONE@@/json'::text, 1::integer, 'deployed'::text) ON CONFLICT (viewer_build_id) DO NOTHING;