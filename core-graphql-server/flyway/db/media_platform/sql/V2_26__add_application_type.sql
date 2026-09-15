INSERT INTO public.root_folder_type (root_folder_type_id, root_folder_type_name)
SELECT 4, 'application'
WHERE NOT EXISTS(
        SELECT 1
        FROM public.root_folder_type
        WHERE root_folder_type_name = 'application'
    );

INSERT INTO public.tree_object_type (tree_object_type_id, tree_object_type_name)
SELECT 6, 'Application'
WHERE NOT EXISTS(
        SELECT 1
        FROM public.tree_object_type
        WHERE tree_object_type_name = 'Application'
    );