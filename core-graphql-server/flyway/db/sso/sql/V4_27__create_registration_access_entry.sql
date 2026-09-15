-- VE-28014 (U1.1, parent VE-27804 / VP-2380): access-list storage foundation — DDL only.
-- Creates the new registration access-list model (FR-8.1) and the org-level not-on-list handling
-- enum column (FR-8.2). Nothing reads or writes these objects yet; the RegistrationAccessStore
-- dual-write (C4) arrives in U1.2 and the backfill of the legacy table in U2.
--
-- Foreign keys are kept for referential integrity and consistency with the registration table family.

-- allow / deny for an access-list entry. 'deny' is defined but not exposed by VP-2380.
DO $$ BEGIN
    CREATE TYPE public.registration_access_auth_type AS ENUM ('allow', 'deny');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- How a registrant who matches no access-list entry is handled (FR-1.2).
DO $$ BEGIN
    CREATE TYPE public.organization_registration_not_on_list_handling AS ENUM (
        'strict_deny',
        'allowed_with_approval',
        'allowed_open'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One row = one access-list entry. The surrogate registration_access_id is the stable identity the
-- new model exists to provide; the legacy organization_registration_domain_settings table has none.
CREATE TABLE IF NOT EXISTS public.registration_access_entry (
    registration_access_id        UUID NOT NULL PRIMARY KEY,
    registration_configuration_id UUID NOT NULL REFERENCES public.organization_registration_configuration (registration_configuration_id) ON DELETE CASCADE,
    value                         TEXT NOT NULL,
    auth_type                     public.registration_access_auth_type DEFAULT 'allow' NOT NULL,
    send_invite_email             BOOLEAN DEFAULT FALSE NOT NULL,
    created_by                    UUID NOT NULL,
    date_created                  TIMESTAMP DEFAULT NOW() NOT NULL,
    modified_by                   UUID NOT NULL,
    date_modified                 TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 1:1 extension of registration_access_entry holding what a matched registrant is granted.
CREATE TABLE IF NOT EXISTS public.registration_access_entry_permission (
    registration_access_id UUID NOT NULL PRIMARY KEY REFERENCES public.registration_access_entry (registration_access_id) ON DELETE CASCADE,
    application_role_ids   TEXT[] NOT NULL,
    auth_group_id          UUID REFERENCES public.rbac_auth_group (auth_group_id) ON DELETE SET NULL,
    created_by             UUID NOT NULL,
    date_created           TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Per-configuration case-insensitive value uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS uq_registration_access_entry__config_value_lower
    ON public.registration_access_entry (registration_configuration_id, lower(value));

-- Not-on-list handling, consulted only when open_registration_status = 'restricted' (FR-1.3).
-- open_registration_status and admin_approval_required are reused as-is, so no configuration-data
-- migration is required (D2).
ALTER TABLE public.organization_registration_configuration
    ADD COLUMN IF NOT EXISTS not_on_list_handling public.organization_registration_not_on_list_handling DEFAULT 'strict_deny' NOT NULL;

ALTER TABLE public.registration_access_entry OWNER TO postgres;
GRANT SELECT ON TABLE public.registration_access_entry TO readaccess;

ALTER TABLE public.registration_access_entry_permission OWNER TO postgres;
GRANT SELECT ON TABLE public.registration_access_entry_permission TO readaccess;

COMMENT ON TYPE public.registration_access_auth_type IS 'VE-28014: access-list entry disposition. ''deny'' is defined but not exposed by VP-2380.';
COMMENT ON TYPE public.organization_registration_not_on_list_handling IS 'VE-28014: how a registrant matching no access-list entry is handled (FR-1.2). Consulted only when open_registration_status = ''restricted''.';

COMMENT ON TABLE  public.registration_access_entry IS 'VE-28014: org registration access-list entry. One row = one matching value; '''' is the Default Access row. Replaces organization_registration_domain_settings and uses the same value representation.';
COMMENT ON COLUMN public.registration_access_entry.registration_access_id IS 'Stable surrogate identity, application-generated. The legacy table has none, so value edits cannot round-trip through it (R6).';
COMMENT ON COLUMN public.registration_access_entry.registration_configuration_id IS 'Owning configuration. FK, ON DELETE CASCADE.';
COMMENT ON COLUMN public.registration_access_entry.value IS 'Matching value in the legacy representation, copied byte for byte: bare domain (''acme.com''), exact address (''a@x.com''), or '''' for Default Access. NOT NULL — Default Access is the empty string, never null. Clients derive the kind: contains @ = address, empty = Default Access, else domain.';
COMMENT ON COLUMN public.registration_access_entry.auth_type IS 'allow | deny. ''deny'' is not exposed by VP-2380.';
COMMENT ON COLUMN public.registration_access_entry.send_invite_email IS 'Whether a matched registrant is sent an invite email.';
COMMENT ON COLUMN public.registration_access_entry.created_by IS 'Creating user; logical ref, no FK. Preserved across in-place edits (FR-2.6), unlike the legacy path (R2).';
COMMENT ON COLUMN public.registration_access_entry.date_created IS 'TIMESTAMP, matching the legacy column. Excluded from FR-8.5 parity along with created_by (R2).';
COMMENT ON COLUMN public.registration_access_entry.modified_by IS 'Last editing user; logical ref, no FK.';
COMMENT ON COLUMN public.registration_access_entry.date_modified IS 'TIMESTAMP, default on insert; update semantics belong to U1.2 (FR-2.6), deliberately not a trigger. In FR-8.5 parity scope — same type as legacy, so directly comparable.';

COMMENT ON TABLE  public.registration_access_entry_permission IS 'VE-28014: what a matched registrant is granted. 1:0..1 with registration_access_entry, keyed by its PK. Intentionally unconstrained beyond NOT NULL so it can represent every legacy row the backfill must carry across.';
COMMENT ON COLUMN public.registration_access_entry_permission.registration_access_id IS 'PK and FK to registration_access_entry, ON DELETE CASCADE.';
COMMENT ON COLUMN public.registration_access_entry_permission.application_role_ids IS 'Application role ids granted on registration. May be empty when auth_group_id carries the grant instead — both are consumed independently at signup. U1.2 rejects the empty-and-no-group case.';
COMMENT ON COLUMN public.registration_access_entry_permission.auth_group_id IS 'Optional auth group. FK, ON DELETE SET NULL — deleting a group degrades this grant instead of deleting rows or blocking. U1.2 must drop the matching entry when rbacAuth.bll.js deletes the legacy row, or FR-8.5 parity diverges.';
COMMENT ON COLUMN public.registration_access_entry_permission.created_by IS 'Creating user; logical ref, no FK.';
COMMENT ON COLUMN public.registration_access_entry_permission.date_created IS 'TIMESTAMP, default on insert. No modified pair — the row is replaced with its parent entry (FR-8.1).';

COMMENT ON INDEX public.uq_registration_access_entry__config_value_lower IS 'Per-configuration case-insensitive value uniqueness, and thereby at most one Default Access ('''') per configuration.';

COMMENT ON COLUMN public.organization_registration_configuration.not_on_list_handling IS 'VE-28014 (FR-8.2): default strict_deny. Sole driver of unmatched-registrant outcomes when restricted; never compounded with admin_approval_required (FR-1.3a).';
