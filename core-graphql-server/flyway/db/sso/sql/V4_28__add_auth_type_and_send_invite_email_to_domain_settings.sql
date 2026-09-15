-- VE-28014 (U1.1, parent VE-27804 / VP-2380): legacy backward compatibility — FR-8.2a.
--
-- Additive ALTER on the LEGACY organization_registration_domain_settings table. Semantics and
-- defaults mirror their registration_access_entry counterparts exactly (V4_27), so the legacy model
-- can *represent* what the new model stores and the dual-write window is not lossy for these two
-- fields. Existing rows take the defaults, which preserves their current behavior exactly.
--
-- This is a backward-compatibility step, not a feature. Ordering is load-bearing: it must be
-- deployed BEFORE dual-write goes live (U1.2 / FR-8.4), because dual-write writes these columns.
-- Both columns are deleted at the FR-8.8 cleanup along with the rest of the legacy read path.
--
-- What this does NOT close: adding a column does not widen a key. This table still has no surrogate
-- id and still keys rows by (registration_configuration_id, domain_name), so registration_access_id
-- cannot round-trip and in-place value edits remain a key change here. That is R6's identity half,
-- gated by FR-8.7 and owned by U1.2 / U1.3.
--
-- Safe on a populated table: PostgreSQL 11+ stores a non-volatile column default in the catalogue
-- rather than rewriting the table, so this takes a brief ACCESS EXCLUSIVE lock and no rewrite.

ALTER TABLE public.organization_registration_domain_settings
    ADD COLUMN IF NOT EXISTS auth_type public.registration_access_auth_type DEFAULT 'allow' NOT NULL,
    ADD COLUMN IF NOT EXISTS send_invite_email BOOLEAN DEFAULT FALSE NOT NULL;

COMMENT ON COLUMN public.organization_registration_domain_settings.auth_type IS 'VE-28014 (FR-8.2a): mirrors registration_access_entry.auth_type. Default preserves existing rows. Removed at the FR-8.8 cleanup.';
COMMENT ON COLUMN public.organization_registration_domain_settings.send_invite_email IS 'VE-28014 (FR-8.2a): mirrors registration_access_entry.send_invite_email. Default preserves existing rows. Removed at the FR-8.8 cleanup.';
