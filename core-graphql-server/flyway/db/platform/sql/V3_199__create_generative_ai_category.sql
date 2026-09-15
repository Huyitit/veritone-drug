/* Create new generative class */
INSERT INTO job_new.engine_class (
        engine_class_id, 
        engine_class_name, 
        engine_class_description, 
        icon_class
        )
        VALUES
        ('29b854d8-b0f4-491e-aec7-be251ad4a51e'::uuid, 'generative', 'The input to engines in the generative class is a text prompt. Generative engines will use this text prompt to generate content of different types using this prompt.', 'icon-automode')
        ON CONFLICT(engine_class_id) DO NOTHING;

/* Create new generative/text category */
INSERT INTO job_new.engine_category (
        engine_category_id,
        engine_category_name,
        engine_category_description,
        data_field,
        "order",
        engine_class_id,
        engine_type_id
        )
        VALUES
        ('697dd382-3858-4427-a4ef-3a4b14b04486', 'Text Generation', 'Produces Text based on a text prompt.', 'text-gen', 25, '29b854d8-b0f4-491e-aec7-be251ad4a51e', 'fcc22feb-9184-4f53-be5e-7694927864d9')
        ON CONFLICT(engine_category_id) DO NOTHING;

/* Create new generative/audio category */
INSERT INTO job_new.engine_category (
        engine_category_id,
        engine_category_name,
        engine_category_description,
        data_field,
        "order",
        engine_class_id,
        engine_type_id
        )
        VALUES
        ('01e2ff2b-d445-483c-a82d-81edbf6299dc', 'Audio Generation', 'Produces an Audio File based on a text prompt.', 'audio-gen', 25, '29b854d8-b0f4-491e-aec7-be251ad4a51e', 'fcc22feb-9184-4f53-be5e-7694927864d9')
        ON CONFLICT(engine_category_id) DO NOTHING;

/* Create new generative/image category */
INSERT INTO job_new.engine_category (
        engine_category_id,
        engine_category_name,
        engine_category_description,
        data_field,
        "order",
        engine_class_id,
        engine_type_id
        )
        VALUES
        ('b66450d7-d2bf-4270-97d4-f0abeddc57f7', 'Image Generation', 'Produces an Image based on a text prompt.', 'image-gen', 25, '29b854d8-b0f4-491e-aec7-be251ad4a51e', 'fcc22feb-9184-4f53-be5e-7694927864d9')
        ON CONFLICT(engine_category_id) DO NOTHING;


/* Create new generative/video category */
INSERT INTO job_new.engine_category (
        engine_category_id,
        engine_category_name,
        engine_category_description,
        data_field,
        "order",
        engine_class_id,
        engine_type_id
        )
        VALUES
        ('5305b6fa-8cda-4944-9a53-304cc3179951', 'Video Generation', 'Produces a Video based on a text prompt.', 'video-gen', 25, '29b854d8-b0f4-491e-aec7-be251ad4a51e', 'fcc22feb-9184-4f53-be5e-7694927864d9')
        ON CONFLICT(engine_category_id) DO NOTHING;

        

/* Create new data/extract category */
INSERT INTO job_new.engine_category (
        engine_category_id,
        engine_category_name,
        engine_category_description,
        data_field,
        "order",
        engine_class_id,
        engine_type_id
        )
        VALUES
        ('3138295c-5099-4692-adb8-9308f4a50ac4', 'Extraction', 'Extracts data from a source.', 'data-extract', 25, 'fc88ed0f-19e7-410c-8d3c-050f6d6e8fb0', 'fcc22feb-9184-4f53-be5e-7694927864d9')
        ON CONFLICT(engine_category_id) DO NOTHING;



