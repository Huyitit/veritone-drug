
UPDATE public.organization 
  SET organization_id = @@{ROOT_ORG_ID}@@
WHERE EXISTS (SELECT * FROM public.organization WHERE organization_name = 'Root Admin' AND organization_id != @@{ROOT_ORG_ID}@@)
  AND organization_name = 'Root Admin';

UPDATE public.organization 
  SET organization_id = 7682
WHERE EXISTS (SELECT * FROM public.organization WHERE organization_name = 'Veritone, Inc.' AND organization_id != 7682)
  AND organization_name = 'Veritone, Inc.';
