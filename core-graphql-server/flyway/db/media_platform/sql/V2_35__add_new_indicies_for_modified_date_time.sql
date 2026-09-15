-- Look at the Notes columns, some indicies are not necessary
-- https://docs.google.com/spreadsheets/d/1zJiNn9aItu6N0cjyWUxkYtC6Iv-eP45n-5w-U29EhNA/edit#gid=0

CREATE INDEX CONCURRENTLY IF NOT EXISTS share_date_created_idx ON public.share USING btree (date_created);
CREATE INDEX CONCURRENTLY IF NOT EXISTS shared_url_modified_date_time_idx ON public.shared_url USING btree (modified_date_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS tree_object_last_updated_date_idx ON public.tree_object USING btree (last_updated_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS tree_object_closure_modified_date_time_idx ON public.tree_object_closure USING btree (modified_date_time);

-- in aiware but no recent data
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS sf_audio_chunk_lastmodifieddate_idx ON public.sf_audio_chunk USING btree (lastmodifieddate);