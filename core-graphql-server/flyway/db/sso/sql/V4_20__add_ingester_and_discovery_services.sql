-- create ingester-service and discovery-service applications. These applications will not be
-- interacted with, but they are required to validate the applicationIDs in GQL calls and own
-- ingest_slugs
INSERT INTO public.application
(
  application_id,
  application_name,
  application_key,
  application_status,
  application_description,
  owner_organization_id
)
VALUES
(
  '84289006-f69b-4648-875b-e573d44a1da3'::uuid,
  'Ingester Service',
  'ingester-service',
  'active'::public.application_status,
  'Headless server that ingests supported files from the ingest_slugs list',
  @@{ROOT_ORG_ID}@@
),
(
  'c0708860-88bc-42d2-9867-d5bed4f323d5'::uuid,
  'Discovery Service',
  'discovery-service',
  'active'::public.application_status,
  'Headless server that monitors sources for new files to ingest and creates ingest slugs for them',
  @@{ROOT_ORG_ID}@@
)
ON CONFLICT (application_id) DO NOTHING;
