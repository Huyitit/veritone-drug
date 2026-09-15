/*
 * Updates the Home application's URL to redirect to the organizations page in the desktop application.
 * 
 * Note:
 * - The Home application was manually set up by the DevOps team
 * - The application_key is used for identification instead of application_id
 *   because application_id values can vary across different environments
 */
UPDATE public.application
SET application_url = 'https://desktop.@@{EXTERNAL_DNS_ZONE}@@/ui/organizations'
WHERE application_key = 'home_app';