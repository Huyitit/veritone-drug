-- VE-26069: make destination.oauth_url_expires_at an absolute instant instead of a naive wall-clock.
--
-- The column was TIMESTAMP (no time zone) (V3_296). core-graphql-server writes a UTC ISO string, which Postgres
-- silently strips the offset from, and node-pg parses oid 1114 back as *process-local* time -- core-graphql-server
-- does not install the oid-1114 UTC type parser that core-admin-server does (core-admin-server/database.js:54),
-- and nothing pins TZ in the Dockerfile or config. So the round trip was only lossless on a UTC container: anywhere
-- else the value came back skewed by the local offset. That is fatal for this column specifically, because it
-- carries a ~5-minute Ayrshare connect-URL expiry -- an offset skew of hours makes every URL read as long expired
-- or never expiring, which is the exact signal the retry flow depends on.
--
-- TIMESTAMPTZ (oid 1184) is parsed by node-pg as an unambiguous instant regardless of process TZ, and is
-- DST-safe, unlike correcting the offset in JS after the fact.
--
-- Existing values are interpreted as UTC, which is what they are: they were written either by the adapter (a
-- UTC ISO string) or by NOW() on a UTC database. In practice there is nothing to convert -- V3_296 recreated the
-- table, and the expiry was never actually computed before this change, so every row's value is NULL.
--
-- Deliberately scoped to this one column. created_at/updated_at have the same latent naive-timestamp skew across
-- this table (and most of the schema), but they are display-only here and converting them is a separate,
-- much broader change.

ALTER TABLE public.destination
  ALTER COLUMN oauth_url_expires_at TYPE TIMESTAMPTZ
  USING oauth_url_expires_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN public.destination.oauth_url_expires_at IS
  'Expiry of oauth_url, as an absolute instant (TIMESTAMPTZ).';
