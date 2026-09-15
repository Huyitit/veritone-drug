DO $$
DECLARE
    graphql_url TEXT;
BEGIN
    IF '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod') THEN
        graphql_url := 'https://api.@@{EXTERNAL_DNS_ZONE}@@/v3/graphql';
    ELSE
        graphql_url := 'https://@@{EXTERNAL_DNS_ZONE}@@/v3/graphql';
    END IF;

    INSERT INTO public.application (
        application_id,
        application_name,
        application_key,
        application_status,
        application_description,
        application_icon_url,
        application_icon_svg,
        application_url,
        application_check_permissions,
        application_order,
        owner_organization_id,
        deployment_model,
        created_date,
        updated_date,
        oauth2_redirect_urls,
        oauth2_client_secret,
        permissions_required,
        application_free_trial_months,
        application_monthly_charge,
        application_charge_per_user,
        public,
        event_endpoint,
        headerbar_enabled
    ) SELECT
        '457715e0-06ff-47c3-a8bf-e67a73c4cfe4',
        'GraphQL Playground',
        'graphql-playground',
        'active',
        'An interactive development environment tailored for GraphQL APIs, facilitating seamless interaction, query testing, and schema exploration for enhanced API development.',
        'https://s3.amazonaws.com/static.veritone.com/veritone-ui/appicons-2/Graphql-logo.png',
        'https://s3.amazonaws.com/static.veritone.com/veritone-ui/app-icons-svg/Graphql.svg',
        graphql_url,
        false,
        0,
        7682,
        0,
        1679788800,
        1679788800,
        graphql_url,
        'bR9vS0g2pTmWcX3Q-lHjFzE7dY5uA8rVwN1oLxI6-yK4DnZaCf',
        NULL,
        0,
        0,
        0,
        false,
        NULL,
        false
    WHERE NOT EXISTS (SELECT 1 FROM public.application WHERE application_id = '457715e0-06ff-47c3-a8bf-e67a73c4cfe4')
    ON CONFLICT DO NOTHING;
END;
$$