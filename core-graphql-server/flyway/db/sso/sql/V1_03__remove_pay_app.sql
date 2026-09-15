-- remove pay-app for a new environment --
DELETE FROM public.application
WHERE application_id = '4a30782e-2808-487b-a359-bc50247af31d';

-- remove pay-app role for a new environment --
DELETE FROM public."role" 
WHERE role_id = '1b6084bb-66c9-4ca5-b1f3-1ba4ca0fdf45';
