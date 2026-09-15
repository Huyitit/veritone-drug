-- v1 folder
INSERT INTO public.root_folder_type (root_folder_type_id, root_folder_type_name) VALUES(7, 'resource') ON CONFLICT DO NOTHING;

-- v2 folder
INSERT INTO public.v2_folder_type (folder_type_id, folder_type_name) VALUES (7, 'Resource') ON CONFLICT DO NOTHING;
