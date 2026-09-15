-- Add aiware.folder.read permission to CMS Viewer role
UPDATE public.role 
SET permissions = '{-2004312064,136,4194304}'
WHERE role_id = '555033d1-508c-49c0-8127-66c2dc129828';