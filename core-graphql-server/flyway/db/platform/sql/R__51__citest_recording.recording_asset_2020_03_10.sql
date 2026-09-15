DO $FLYWWAY$
BEGIN
    IF (NOT EXISTS (SELECT * 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = 'recording' 
                    AND  TABLE_NAME = 'recording_asset_2020_03_10')) THEN
      CREATE TABLE recording.recording_asset_2020_03_10
      (
          -- Inherited from table recording.recording_asset: asset_id text COLLATE pg_catalog."default" NOT NULL,
          -- Inherited from table recording.recording_asset: recording_id text COLLATE pg_catalog."default" NOT NULL,
          -- Inherited from table recording.recording_asset: metadata jsonb,
          -- Inherited from table recording.recording_asset: type text COLLATE pg_catalog."default" NOT NULL,
          -- Inherited from table recording.recording_asset: content_type text COLLATE pg_catalog."default" NOT NULL,
          -- Inherited from table recording.recording_asset: uri text COLLATE pg_catalog."default" NOT NULL,
          -- Inherited from table recording.recording_asset: created_date_time integer DEFAULT date_part('epoch'::text, now()),
          -- Inherited from table recording.recording_asset: external_credential_id text COLLATE pg_catalog."default",
          -- Inherited from table recording.recording_asset: user_edited boolean,
          CONSTRAINT recording_asset_2020_03_10_pkey PRIMARY KEY (asset_id),
          CONSTRAINT recording_asset_2020_03_10_recording_id_check CHECK (recording_id::integer >= 910000000 AND recording_id::integer < 920000000)
      )
          INHERITS (recording.recording_asset)
      WITH (
          OIDS = FALSE
      )
      TABLESPACE pg_default;

      ALTER TABLE recording.recording_asset_2020_03_10
          OWNER to postgres;
      -- Index: _ix_recording.recording_asset_2020_03_10@created_date_time

      -- DROP INDEX recording."_ix_recording.recording_asset_2020_03_10@created_date_time";

      CREATE INDEX "_ix_recording.recording_asset_2020_03_10@created_date_time"
          ON recording.recording_asset_2020_03_10 USING btree
          (created_date_time ASC NULLS LAST)
          TABLESPACE pg_default;
      -- Index: _ix_recording.recording_asset_2020_03_10@recording_id

      -- DROP INDEX recording."_ix_recording.recording_asset_2020_03_10@recording_id";

      CREATE INDEX "_ix_recording.recording_asset_2020_03_10@recording_id"
          ON recording.recording_asset_2020_03_10 USING btree
          (recording_id COLLATE pg_catalog."default" ASC NULLS LAST)
          TABLESPACE pg_default;
    END IF;
END;
$FLYWWAY$
