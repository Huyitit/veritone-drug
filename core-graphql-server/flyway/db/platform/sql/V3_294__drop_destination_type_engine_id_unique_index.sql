-- VE-24929: drop the obsolete UNIQUE index on destination_type.engine_id.
--
-- V3_289 created "idx_destination_type__engine_id_unique" under the original 1:1 destination-type↔engine model.
-- The generalized Ayrshare distribute engine (VE-24797) has ONE engine serve every platform (routed by platform
-- key), so engine_id is intentionally SHARED across destination_type rows (YouTube, Facebook, Instagram, TikTok, …
-- all reference the same engine UUID). The unique index is therefore wrong and blocks seeding a 2nd platform.
-- V3_289 is already on master, so drop the index here rather than editing it in place.
DROP INDEX IF EXISTS public.idx_destination_type__engine_id_unique;
