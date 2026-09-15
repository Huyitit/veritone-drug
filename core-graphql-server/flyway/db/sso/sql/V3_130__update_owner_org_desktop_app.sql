-- Updates the owner_organization_id to root org for the desktop app
UPDATE public.application
SET owner_organization_id = @@{ROOT_ORG_ID}@@
WHERE application_key = 'aiware_desktop' OR application_id = 'e4739d44-53d2-4153-b55f-5e246fc989b1';
