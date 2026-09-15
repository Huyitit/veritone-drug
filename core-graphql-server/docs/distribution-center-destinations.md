# Distribution Center — social destinations (VE-24621 / VE-24929)

The aiware-core (U-SHARED-CORE) backend for publishing Veritone assets to social platforms (YouTube today; Facebook,
Instagram, TikTok, and future platforms as data). All destination code lives in `modules/v3DataModel/`; the per-platform
Ayrshare mapping lives in the engine (U-SHARED-ENGINE, all platforms table-driven in PR #1767).

**Behaviors:**

- **Connect** (`destinationOAuth.js`) — mints an Ayrshare hosted-linking JWT scoped to a single network. `allowedSocial`
  is derived server-side from `destination_type.platform` (`allowedSocial.js`, BR-1), never client-supplied. A platform's
  connect is gated OFF until Ayrshare white-label is configured, via the `enabledDestinationConnects` array flag
  (`destinationConnectPolicy.js`, BR-5). On completion the server enforces that the connected network matches the type
  (BR-6) and returns actionable prerequisite errors (`destinationConnectErrors.js`, US-P4 / R-X1).
- **Validate** (`distributeAsset.js`) — re-validates `platformPayload` against the type's `publishSchema` server-side with
  ajv8 + ajv-formats, matched to the FE's `@rjsf/validator-ajv8` (`validation/schemaValidator.js`, BR-2 / R-P5).
- **Pre-flight media constraints** (`bll/mediaConstraintPolicy.js`, VE-26450) — before creating a Job, rejects a
  publish whose media duration violates the destination's declared limits (`destination_media_constraint`, seeded
  in V3_299/V3_300). Duration only; dimensions and aspect ratio are declared but not enforced — applying them to the
  rendition selected by VE-26886 below is follow-up work.
  To exercise it locally see
  [distribution-center-media-constraints-testing.md](distribution-center-media-constraints-testing.md).
- **Distribute** (`distributeAsset.js`) — after validation, selects the publish rendition and `createJob` emits the
  task payload routed to the generic Ayrshare engine by `engineId`. No `signedUrl` is sent. **Media precedence at the
  engine** (engines PR #1843): `signedUrl` → `assetId` → the TDO's primary media asset. For DMH content the primary
  media asset is always a Preview (VE-26886), so core selects the publish-suitable `dmh-rendition` (Master, else Proxy;
  `metadata.details.dmh.Purpose`) and sends its id as `payload.assetId` **and** as the job's `sourceAssetId`. The two
  must agree: on the edge task path `bll/task.createTaskPayload` rewrites `payload.assetId` from `task.source_asset_id`
  and strips it when null, and `dal/job.createJob` copies the job-level value down to every task row. `retryJob`
  (`dal/dalEngine.js`) re-submits `sourceAssetId` for the same reason — a retried publish must post the same file.
  (Job clones onto another TDO deliberately do not carry it; asset ids are TDO-scoped.)
  **Suitability**: non-empty `uri`, a vendor-acceptable container (no MXF), and — under the size ceiling
  `social.maxPublishRenditionFileSizeBytes` (default 4 GiB; 0 disables; an unusable value falls back to the default,
  never to "off") — a KNOWN size under the ceiling. Both size fields are untrusted (`metadata.size` is caller input at
  `createAsset` and the size probe writes `0` on failure; `dmh.FileSize` is vendor metadata): only a positive number
  counts, the larger governs, and a Master whose size is unknown fails closed to the Proxy (`unknown_size`). A Proxy
  with an unknown size stays eligible.
  **Rejection**: a TDO with dmh-renditions but no publishable Master/Proxy is rejected with `resource_conflict`;
  `data.retryable` is true when waiting may help (no Master/Proxy yet, empty `uri`, unknown Master size) and false when
  every candidate is permanently unpublishable (container/size); `data.reasons` lists the distinct causes. The reject
  has one runtime lever, `social.rejectWhenNoPublishRendition` (default true): false restores the pre-VE-26886
  warn-and-fall-through for rollout back-out only. Only a TDO with no dmh-renditions falls through to the primary media
  asset. Any asset-store read error other than a missing `recording_asset` partition fails the mutation rather than
  degrading. Misses are counted on `social_publish_rendition_miss_total{reason}`. Payload keys the engine reads:
  `platform`, `destinationId`, `platformPayload`, `assetId`, `tdoId`/`recordingId`, `signedUrl` (unused by core),
  `mediaType`, `randomMediaUrl` (test only).
- **Seed** — new platforms are added as data via the additive Flyway convention below.

---

## Seed convention — add a new social destination as data

The VP-2581 foundation — the `destination_type` + `destination` tables, the shared Ayrshare engine, and the YouTube
seed — is on `master` at `V3_289`–`V3_292` (+ YouTube schemas at `V1_13`). Facebook / Instagram / TikTok are added
**append-only** on top:

- `flyway/db/platform/sql/V3_294__drop_destination_type_engine_id_unique_index.sql` — drops the obsolete `engine_id`
  unique index (the generalized engine is shared across all platforms, VE-24797).
- `flyway/db/platform/sql/V3_295__seed_social_destinations.sql` — the FB/IG/TikTok `destination_type` rows.
- `flyway/db/structured_data/sql/V1_14__seed_social_destination_schemas.sql` — their config + publish schemas.

To add a **new** platform later, append ONE more additive seed migration (no code change) using `V3_295`'s rows as the
template. Invariants are enforced by
[`modules/v3DataModel/social/socialDestinationSeed.convention.spec.js`](../modules/v3DataModel/social/socialDestinationSeed.convention.spec.js).

### Per new platform, seed three rows

1. **`public.destination_type`** (this DB, `platform` Flyway DB → `core` connection) — one row:
   - `platform` — **lowercase** key (`facebook` | `instagram` | `tiktok` | …). This value is load-bearing: BR-1 maps it
     to the Ayrshare `allowedSocial` network, `completeDestinationConnection` matches it against the connected network,
     the catalog filter uses it, and the engine registry looks it up (after `strings.ToLower`). Lowercase is required.
   - `engine_id` — the **existing generic distribute engine UUID** `16568b5f-2aaa-48e6-975b-2dec5f098a29`.
     **Do NOT seed a new `job_new.engine` row** — every platform reuses this one engine (Q-AD4).
   - `name`, `vendor_capability` (`social-publish`), `icon_class`, `is_public`, and the two schema ids below.
   - Pre-generate a hardcoded `id` (uuid) so it's identical across dev/stage/prod. Use `ON CONFLICT (id) DO UPDATE …`
     so the migration is idempotent.
2. **`configSchema`** Schema row (structured_data DB / `data_registries`) — `{}` (label-only Connect; Q-NEW-3).
3. **`publishSchema`** Schema row (structured_data DB / `data_registries`) — the platform's MVP publish fields.
   - Authored as **JSON Schema draft-07**. The server validates `platformPayload` against it with **ajv8 + ajv-formats**
     configured to match the FE's `@rjsf/validator-ajv8`
     (see [`modules/v3DataModel/validation/schemaValidator.js`](../modules/v3DataModel/validation/schemaValidator.js) /
     BR-2), so the **full draft-07 feature set is available** (`format`, `enum`, `exclusiveMinimum`, `if/then/else`, …)
     — no keyword subset restriction. Field sets come from the vendor survey (VE-24935).

### Rules

- **Lowercase `platform`** value — *enforced by the guard test*.
- **Reuse the shared generic engine UUID** `16568b5f-…` — *enforced by the guard test*. One engine serves every
  platform (routed by platform key); `engine_id` is not unique across rows.
- **Additive** — a new platform is a new migration; the tables already exist, so no DDL is needed.
- **Idempotent** — `ON CONFLICT (id) DO UPDATE`.

### What is NOT seeded here

Per-platform Ayrshare `*Options` mapping lives in the engine (U-SHARED-ENGINE, all platforms table-driven in PR #1767).
This convention only adds the aiware-core catalog + schema data.
