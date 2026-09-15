-- VE-18814 Add new S3 discovery source type

DO $$
BEGIN
  -- do not overwrite or duplicate the S3 discovery source type if it already exists.
  IF EXISTS (SELECT 1 FROM public.media_source_type WHERE media_source_type_name = 'Discovery: Amazon S3') THEN

    -- ensure some critical fields are correct (i.e. matches the config schema created in
    -- V1_10__s3_discovery_media_source_type_schema.sql and that it is public)
    UPDATE public.media_source_type SET
      config_schema_id       = '15809312-bf11-45c3-b271-aa07378e6bf9'::uuid,
      is_public              = true,
      requires_scan_pipeline = false,
      is_live                = false
    WHERE media_source_type_name = 'Discovery: Amazon S3';

  ELSE

    INSERT INTO public.media_source_type
    (
      media_source_type_id,
      media_source_type_name,
      config_schema_id,
      credential_type,
      owner_organization_id,
      is_public,
      requires_scan_pipeline,
      is_live,
      media_source_type_category,
      icon_class
    )
    VALUES
    (
      -- the standardized media_source_type_id for the S3 discovery source type is 24, but in
      -- case that has already been used for some reason, we will use the max + 1 to avoid
      -- conflicts
      CASE WHEN EXISTS (SELECT 1 FROM public.media_source_type WHERE media_source_type_id = 24)
        THEN (SELECT MAX(media_source_type_id) + 1 FROM public.media_source_type)
        ELSE 24
      END,
      'Discovery: Amazon S3',
      '15809312-bf11-45c3-b271-aa07378e6bf9'::uuid,
      'None',
      @@{ROOT_ORG_ID}@@,
      true,
      false,
      false,
      5,
      'icon-Amazon-Web-Services_Logo'
    );

  END IF;
END $$;
