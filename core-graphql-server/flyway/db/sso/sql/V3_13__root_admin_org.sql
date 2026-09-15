
UPDATE public.sso_group
	SET kvp = kvp::jsonb - 'organizationId' || '{"organizationId": "7682"}'::jsonb
WHERE
	group_name = 'Veritone, Inc.' AND kvp->>'organizationId' != '7682';

UPDATE public.sso_group
	SET kvp = kvp::jsonb - 'organizationId' || '{"organizationId": "@@{ROOT_ORG_ID}@@"}'::jsonb
WHERE
	group_name = 'Root Admin' AND kvp->>'organizationId' != '@@{ROOT_ORG_ID}@@';

UPDATE public.application SET owner_organization_id = @@{ROOT_ORG_ID}@@ 
  WHERE owner_organization_id = 1;
