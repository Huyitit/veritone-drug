# Structured Data Database - Flyway Migrations

## readaccess User Notice

**Important:** The `structured_data` database does not currently support a
consistently provisioned `readaccess` user across all environments.

### Current State

- The `readaccess` role is **not provisioned consistently** across environments
- No tables in the `structured_data` schema grant permissions to `readaccess`

### Reason

Some instances of `third_party_db` do not have the `readaccess` role. Including
GRANT statements in Flyway migrations would cause those migrations to fail.

### Future Work

`readaccess` support will be added in a follow-up ticket with consistent role
provisioning and grants across all `structured_data` tables.

Tracking ticket: **[VE-17582](https://veritone.atlassian.net/browse/VE-17582)**

### Developer Note

**Do not add** `GRANT TO readaccess` statements in this folder until the
follow-up work is completed.
