-- add default roles for Applications when running event handling
INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
VALUES (
           '13634222-b879-4677-be03-d4ecad8fb2c2',
           'No App Access',
           'No access to anything that requires access permissions',
           NULL,
           '{}',
           NULL,
           FALSE
       ) ON CONFLICT (role_id) DO UPDATE
    SET permissions = '{}';

-- permissions for the role (permission bit + symbolic name):
--   3 admin.org.read
--   6 admin.user.read
--  10 admin.group.read
--  73 admin.profile.read
--  42 collections.collections.read
--  46 collections.mentions.read
--  69 collections.users.read
--  26 job.create
--  27 job.read
--  30 task.create
--  31 task.read
--  35 recording.read
--  49 mentions.read

INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
VALUES (
           '5e9cfff9-4652-4755-ae49-796615079375',
           'Default App Access',
           'Default permissions for application event handling',
           NULL,
           '{-872414136,148488,544}',
           NULL,
           FALSE
       ) ON CONFLICT (role_id) DO UPDATE
    SET permissions = '{-872414136,148488,544}';
