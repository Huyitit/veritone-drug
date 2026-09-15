ALTER TABLE public.organization_registration_domain_settings
ALTER COLUMN auth_group_id DROP NOT NULL;

ALTER TABLE organization_invite
ADD COLUMN IF NOT EXISTS auth_group_ids TEXT[];



