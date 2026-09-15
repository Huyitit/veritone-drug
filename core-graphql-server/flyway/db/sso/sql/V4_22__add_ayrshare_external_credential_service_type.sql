-- VP-2581: add 'ayrshare' to the external_credential.service_type enum.
-- The aiware-core resolver stores the Ayrshare PRIMARY_API_KEY as an sso.external_credential row
-- (service_type='ayrshare', credential_name='ayrshare-primary') for the OAuth/profile calls (engine-ayrshare-auth.md).
-- NOTE: this migration ONLY adds the enum value. A new enum value cannot be USED in the same transaction that
-- adds it, so the credential row itself is seeded separately at deploy-time via the createExternalCredential
-- admin mutation (plaintext never appears in Flyway). Mirrors V3_136 (which added 'oidc').
ALTER TYPE public.service_type ADD VALUE IF NOT EXISTS 'ayrshare';
