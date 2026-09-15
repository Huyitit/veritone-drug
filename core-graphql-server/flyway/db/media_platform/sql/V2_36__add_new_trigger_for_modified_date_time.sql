
-- Doc: https://docs.google.com/spreadsheets/d/1zJiNn9aItu6N0cjyWUxkYtC6Iv-eP45n-5w-U29EhNA/edit#gid=0

DROP TRIGGER IF EXISTS media_upd ON public.media;
CREATE TRIGGER media_upd
    BEFORE UPDATE
    ON public.media
    FOR EACH ROW
EXECUTE PROCEDURE date_modified_ts_upd();

DROP TRIGGER IF EXISTS media_metadata_upd ON public.media_metadata;
CREATE TRIGGER media_metadata_upd
    BEFORE UPDATE
    ON public.media_metadata
    FOR EACH ROW
EXECUTE PROCEDURE modified_date_time_ts_upd();

DROP TRIGGER IF EXISTS media_source_upd ON public.media_source;
CREATE TRIGGER media_source_upd
    BEFORE UPDATE
    ON public.media_source
    FOR EACH ROW
EXECUTE PROCEDURE date_modified_ts_upd();

DROP TRIGGER IF EXISTS mention_upd ON public.mention;
CREATE TRIGGER mention_upd
    BEFORE UPDATE
    ON public.mention
    FOR EACH ROW
EXECUTE PROCEDURE updated_at_ts_upd();

DROP TRIGGER IF EXISTS organization_upd ON public.organization;
CREATE TRIGGER organization_upd
    BEFORE UPDATE
    ON public.organization
    FOR EACH ROW
EXECUTE PROCEDURE date_modified_ts_upd();

-- ## Obsolete, no need to sync (applies to all sf_* tables)
-- DROP TRIGGER IF EXISTS sf_audio_chunk_upd ON public.sf_audio_chunk;
-- CREATE TRIGGER sf_audio_chunk_upd
--     BEFORE UPDATE
--     ON public.sf_audio_chunk
--     FOR EACH ROW
-- EXECUTE PROCEDURE lastmodifieddate_ts_upd();

-- ## Use date_created for the index since the contents of this table are not modified
-- DROP TRIGGER IF EXISTS share_upd ON public.share;
-- CREATE TRIGGER share_upd
--     BEFORE UPDATE
--     ON public.share
--     FOR EACH ROW
-- EXECUTE PROCEDURE modified_date_time_ts_upd();

DROP TRIGGER IF EXISTS shared_url_upd ON public.shared_url;
CREATE TRIGGER shared_url_upd
    BEFORE UPDATE
    ON public.shared_url
    FOR EACH ROW
EXECUTE PROCEDURE modified_date_time_ts_upd();

DROP TRIGGER IF EXISTS tree_object_upd ON public.tree_object;
CREATE TRIGGER tree_object_upd
    BEFORE UPDATE
    ON public.tree_object
    FOR EACH ROW
EXECUTE PROCEDURE last_updated_date_ts_upd();

DROP TRIGGER IF EXISTS tree_object_closure_upd ON public.tree_object_closure;
CREATE TRIGGER tree_object_closure_upd
    BEFORE UPDATE
    ON public.tree_object_closure
    FOR EACH ROW
EXECUTE PROCEDURE modified_date_time_ts_upd();
