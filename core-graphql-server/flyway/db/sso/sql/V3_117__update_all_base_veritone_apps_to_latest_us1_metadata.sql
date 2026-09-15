-- AWT-13150:
-- Flyway to update all base Veritone applications to be consistent with latest US-1 metadata across all instances

-- Developer
UPDATE
    public.application
SET
    application_name = 'Developer',
    application_description = 'Create engines and applications.',
    application_icon_url = 'https://www.filepicker.io/api/file/LV5E2iaFQ3OwDYw3XKaW',
    application_icon_svg = 'https://static.veritone.com/veritone-ui/app-icons-svg/developer-app.svg'
WHERE
    application_id = 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0';

-- Admin
UPDATE
    public.application
SET
    application_name = 'Admin',
    application_description = 'Manage your organization''s information, users and permissions',
    application_icon_url = 'https://www.filepicker.io/api/file/U3eW5m20QBCCG1GJh1RE',
    application_icon_svg = 'https://static.veritone.com/veritone-ui/app-icons-svg/admin-app.svg'
WHERE
    application_id = 'ea1d26ab-0d29-4e97-8ae7-d998a243374e';

-- Data Center (CMS)
UPDATE
    public.application
SET
    application_name = 'Data Center',
    application_description = 'With Veritone CMS, you can create, share, run cognitive engines, and keep all your files together to share with your organization.',
    application_icon_url = 'https://www.filepicker.io/api/file/rfcgYi83RNSlJmO6BAtl',
    application_icon_svg = 'https://static.veritone.com/veritone-ui/app-icons-svg/cms-app.svg'
WHERE
    application_id = '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5';

-- Library
UPDATE
    public.application
SET
    application_name = 'Library',
    application_description = 'Create training models for cognitive engines to find what’s important in your media quickly, easily, and more accurately.',
    application_icon_url = 'https://www.filepicker.io/api/file/QCS0kJNZSWelz7rSS2EE',
    application_icon_svg = 'https://static.veritone.com/veritone-ui/app-icons-svg/library-app.svg'
WHERE
    application_id = 'cf05552b-52e0-46fa-8f7f-4c9eee135c51';

-- Automate Studio
UPDATE
    public.application
SET
    application_name = 'Automate Studio',
    application_description = 'Automate Studio is the application that provides a transformative tool for non-engineering users to blend their data sources with Veritone cognition and inform business logic in aiWARE logic or their own third party systems',
    application_icon_url = 'https://www.filepicker.io/api/file/y7quAo9eScOtAzD32FyM',
    application_icon_svg = NULL
WHERE
    application_id = 'bdf9375e-1092-4233-8197-9ccbc11357c5';
