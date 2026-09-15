-- AWT-9182
UPDATE public.organization
    set kvp = jsonb_set(kvp::jsonb, '{features, automaticPackageCreation}', to_jsonb('disabled'::text))::json
WHERE organization_id = @@{ROOT_ORG_ID}@@;
