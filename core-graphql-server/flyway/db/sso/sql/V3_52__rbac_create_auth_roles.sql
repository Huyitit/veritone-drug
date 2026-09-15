

-- Add list of Authorization Roles that is covering the core functionalities of the platform, based on the current set of functional permissions and permissioned object types.
-- The list of object types: Recording, SDO (no role), Folder, Source, User, Organization, Job, Engine, Build, Library (no role), Dataset (no role), Application.

-- TDO: read_only (fp: recording.read)
INSERT INTO public.rbac_role (
  role_id, 
  role_name,
  role_description,
  permissions
) SELECT 
  '8f9f7276-b34c-428e-8cea-6ae30da956a2', 
  'tdo:read_only',
  'Grants read access to TDO',
  'x00000000000000000000000800000000'
WHERE NOT EXISTS (
  SELECT 1 FROM public.rbac_role
  WHERE role_id = '8f9f7276-b34c-428e-8cea-6ae30da956a2' AND role_name = 'tdo:read_only'
);

-- TDO - update (fp: recording.read,recording.update,asset.all)
INSERT INTO public.rbac_role (
  role_id, 
  role_name,
  role_description,
  permissions
) SELECT 
  '17c44d74-0a97-4727-a58d-6dc79d4355c8', 
  'tdo:update',
  'Grants read/write access to the TDO, TDO metadata and assets',
  'x04000000000000000000001800000000'
WHERE NOT EXISTS (
  SELECT 1 FROM public.rbac_role
  WHERE role_id = '17c44d74-0a97-4727-a58d-6dc79d4355c8' AND role_name = 'tdo:update'
);

-- TDO - full access (fp: recording.read,recording.update,recording.delete,asset.all)
INSERT INTO public.rbac_role (
  role_id, 
  role_name,
  role_description,
  permissions
) SELECT 
  'ca820819-86e3-41c3-8f15-67493e819a48', 
  'tdo:full_access',
  'Grants read/write/delete access to TDO, TDO metadata and assets',
  'x04000000000000000000003800000000'
WHERE NOT EXISTS (
  SELECT 1 FROM public.rbac_role
  WHERE role_id = 'ca820819-86e3-41c3-8f15-67493e819a48' AND role_name = 'tdo:full_access'
);

-- Folder - read_only (fp: discovery.folder.read)
INSERT INTO public.rbac_role (
  role_id, 
  role_name,
  role_description,
  permissions
) SELECT 
  '5b2f4686-32fa-4a6e-bb54-5f812a826113', 
  'folder:read_only',
  'Grants read only access to folder',
  'x00000000004000000000000800000000'
WHERE NOT EXISTS (
  SELECT 1 FROM public.rbac_role
  WHERE role_id = '5b2f4686-32fa-4a6e-bb54-5f812a826113' AND role_name = 'folder:read_only'
);

-- Folder - full_access (fp: discovery.folder.read,discovery.folder.update,discovery.folder.delete,discovery.folder.share)
INSERT INTO public.rbac_role (
  role_id, 
  role_name,
  role_description,
  permissions
) SELECT 
  '3967103c-7941-46da-9792-fdf3750ef8d9', 
  'folder:full_access',
  'Grants full access to folder',
  'x0000000003c000000000000800000000'
WHERE NOT EXISTS (
  SELECT 1 FROM public.rbac_role
  WHERE role_id = '3967103c-7941-46da-9792-fdf3750ef8d9' AND role_name = 'folder:full_access'
);