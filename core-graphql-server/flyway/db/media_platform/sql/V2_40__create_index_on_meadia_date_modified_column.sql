CREATE INDEX CONCURRENTLY IF NOT EXISTS "ix_media@date_modified" ON public.media USING btree (date_modified);
