INSERT INTO public.v2_folder_type (folder_type_id, folder_type_name) VALUES (1, 'Folder') ON CONFLICT DO NOTHING;
INSERT INTO public.v2_folder_type (folder_type_id, folder_type_name) VALUES (2, 'Watchlist') ON CONFLICT DO NOTHING;
INSERT INTO public.v2_folder_type (folder_type_id, folder_type_name) VALUES (3, 'Collection') ON CONFLICT DO NOTHING;
INSERT INTO public.v2_folder_type (folder_type_id, folder_type_name) VALUES (5, 'CMS') ON CONFLICT DO NOTHING;
INSERT INTO public.v2_folder_type (folder_type_id, folder_type_name) VALUES (6, 'Application') ON CONFLICT DO NOTHING;
