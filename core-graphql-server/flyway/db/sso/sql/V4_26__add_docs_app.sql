-- VP-2877 (Increment 10): Seed the "Documentation" aiWARE Application record in the SSO database.
-- Mirrors V3_83__add_home_app.sql. headerbar_enabled = true so aiWARE wraps the docs site with the
-- header bar (iframe). Unlike Home, this seeds in ALL environments (no NODE_ENV gate). Idempotent via a
-- fixed application_id + NOT EXISTS guard + ON CONFLICT DO NOTHING.
--
-- Visibility: the docs app is owned by the root org (owner_organization_id = @@{ROOT_ORG_ID}@@) and is
-- private (public = false). The core-graphql-server application DAL surfaces owned apps to the owning org
-- via the "owned" access scope (a.owner_organization_id = <org>), independent of the public flag, so no
-- role or application__organization row is required for the root org to see it. See "Report" notes.
INSERT INTO public.application (application_id, application_name, application_key, application_status,
                                application_description, application_icon_url, application_icon_svg, application_url,
                                application_check_permissions, application_order, owner_organization_id,
                                deployment_model, created_date, updated_date, oauth2_redirect_urls,
                                oauth2_client_secret, permissions_required, application_free_trial_months,
                                application_monthly_charge, application_charge_per_user, public, event_endpoint,
                                headerbar_enabled)
SELECT '6054c305-bdd4-4057-a741-5a33cb8d1bc9',
       'Documentation',
       'docs',
       'active',
       'Veritone aiWARE product documentation.',
       '',
       null,
       'https://docs.@@{EXTERNAL_DNS_ZONE}@@',
       false,
       0,
       @@{ROOT_ORG_ID}@@,
       0,
       1786579200,
       1786579200,
       null,
       null,
       null,
       0,
       0,
       0,
       false,
       null,
       true
WHERE (NOT EXISTS(SELECT 1 FROM public.application WHERE application_id = '6054c305-bdd4-4057-a741-5a33cb8d1bc9'))
ON CONFLICT DO NOTHING;
