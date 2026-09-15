INSERT INTO public.program (
    program_id,
    program_name,
    program_description,
    program_format_id,
    media_source_type_id,
    primary_media_source_id,
    recording_status_id,
    date_created,
    date_modified,
    is_national,
    is_public,
    is_nationally_syndicated,
    program_sequence,
    is_active,
    run_mode,
    task_data
  )
VALUES
  (
    -1,                                             -- program_id
    'Private Media',                                -- program_name
    'DO NOT DELETE!!  Created by James Bailey.',    -- program_description
    121,                                            -- program_format_id
    5,                                              -- media_source_type_id
    -1,                                             -- primary_media_source_id
    3,                                              -- recording_status_id
    current_timestamp,                              -- date_created
    current_timestamp,                              -- date_modified
    TRUE,                                           -- is_national
    TRUE,                                           -- is_public
    FALSE,                                          -- is_nationally_syndicated
    0,                                              -- program_sequence
    FALSE,                                          -- is_active
    '1',                                            -- run_mode
    '{
        "engineIds": [],
        "clusterIds": [],
        "engineTypeIds": [],
        "jobPipelineIds": [],
        "jobTemplateIds": [],
        "engineTypeNames": [],
        "numJobTemplates": 0,
        "numTaskTemplates": 0,
        "allJobTemplateIds": [],
        "engineCategoryIds": []
    }' -- task_data
  )
  ON CONFLICT DO NOTHING;
